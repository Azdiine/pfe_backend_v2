const prisma = require('../../config/prisma');
const { hashPassword, comparePassword } = require('../../utils/hash');
const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const { sendOtpEmail, sendPasswordResetEmail } = require('../../utils/email');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const validator = require('validator');

// Generate 6-digit OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();

// Un code OTP est invalidé après 5 essais ratés (empêche le brute force
// du code à 6 chiffres même sous le radar du rate limiting par IP)
const OTP_MAX_ATTEMPTS = 5;

// Vérifie un code OTP (par usage : 'register' ou 'reset') et le consomme.
// Chaque échec incrémente le compteur ; au 5e, le code est définitivement brûlé.
const findAndConsumeOtp = async (email, code, purpose) => {
  const otpRecord = await prisma.otpCode.findFirst({
    where: { email, purpose, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    throw { statusCode: 400, message: 'Invalid or expired OTP code' };
  }

  if (otpRecord.code !== code) {
    const updated = await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });
      throw { statusCode: 429, message: 'Too many attempts. Request a new code.' };
    }
    throw { statusCode: 400, message: 'Invalid or expired OTP code' };
  }

  await prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });
  return otpRecord;
};

// SHA-256 (not bcrypt) for refresh tokens: bcrypt truncates its input at
// 72 bytes and all JWT refresh tokens of a given user share their first
// 72 characters (header + start of payload), so bcrypt made every token
// of a user match every session — rotation/revocation had no effect.
// SHA-256 is deterministic, so the session can also be found by direct
// indexed lookup instead of comparing against every session of the user.
const hashRefreshToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const parseExpiryToMs = (expiry) => {
  if (!expiry) return 0;
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return Number(expiry) * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] || 1000);
};

const createSession = async (userId, refreshToken) => {
  const expiresAt = new Date(Date.now() + parseExpiryToMs(process.env.JWT_REFRESH_EXPIRES_IN || '30d'));
  // Opportunistic cleanup so expired sessions don't pile up forever
  await prisma.userSession.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
  return prisma.userSession.create({
    data: {
      userId,
      refreshToken: hashRefreshToken(refreshToken),
      expiresAt,
    },
  });
};

const findValidRefreshSession = async (refreshToken) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw { statusCode: 401, message: 'Invalid refresh token' };
  }

  if (!payload?.id) {
    throw { statusCode: 401, message: 'Invalid refresh token payload' };
  }

  const session = await prisma.userSession.findFirst({
    where: {
      userId: payload.id,
      refreshToken: hashRefreshToken(refreshToken),
      expiresAt: { gt: new Date() },
    },
  });

  if (!session) {
    throw { statusCode: 401, message: 'Refresh token not valid or expired' };
  }

  return { session, userId: payload.id };
};

const rotateSessionRefreshToken = async (session, newRefreshToken) => {
  const expiresAt = new Date(Date.now() + parseExpiryToMs(process.env.JWT_REFRESH_EXPIRES_IN || '30d'));
  return prisma.userSession.update({
    where: { id: session.id },
    data: { refreshToken: hashRefreshToken(newRefreshToken), expiresAt },
  });
};

// Register: NO user created yet — just store OTP with registration data + send email
const register = async (email, password, name) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw { statusCode: 409, message: 'Email already registered' };
  }

  // Opportunistic cleanup: expired OTP rows are useless (they hold a
  // password hash, no reason to keep them around)
  await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  // Invalidate any previous pending OTPs for this email
  await prisma.otpCode.updateMany({
    where: { email, used: false },
    data: { used: true },
  });

  const passwordHash = await hashPassword(password);
  const code = generateOtp();
  const expiryMin = Number(process.env.OTP_EXPIRY_MINUTES) || 10;

  await prisma.otpCode.create({
    data: {
      email,
      name,
      passwordHash,
      code,
      expiresAt: new Date(Date.now() + expiryMin * 60 * 1000),
    },
  });

  // Send OTP email
  await sendOtpEmail(email, code);

  return {
    email,
    message: 'OTP sent to your email',
  };
};

// Verify OTP: NOW create the user + profile
const verifyOtp = async (email, code) => {
  // Check if user was already created (double submit)
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw { statusCode: 409, message: 'Account already exists' };
  }

  const otpRecord = await findAndConsumeOtp(email, code, 'register');

  // NOW create the user + profile
  const user = await prisma.user.create({
    data: {
      email: otpRecord.email,
      name: otpRecord.name,
      passwordHash: otpRecord.passwordHash,
      isVerified: true,
      profile: {
        create: { name: otpRecord.name, onboardingDone: false },
      },
    },
    include: { profile: true },
  });

  const token = generateToken({ id: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ id: user.id });
  await createSession(user.id, refreshToken);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isVerified: true,
    },
    token,
    refreshToken,
  };
};

// Resend OTP (for pending registration)
const resendOtp = async (email) => {
  // Check this email isn't already a verified user
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw { statusCode: 400, message: 'Account already exists' };
  }

  // Find the most recent pending OTP to get registration data
  const lastOtp = await prisma.otpCode.findFirst({
    where: { email },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastOtp) {
    throw { statusCode: 404, message: 'No pending registration found for this email' };
  }

  // Invalidate previous OTPs
  await prisma.otpCode.updateMany({
    where: { email, used: false },
    data: { used: true },
  });

  const code = generateOtp();
  const expiryMin = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
  await prisma.otpCode.create({
    data: {
      email: lastOtp.email,
      name: lastOtp.name,
      passwordHash: lastOtp.passwordHash,
      code,
      expiresAt: new Date(Date.now() + expiryMin * 60 * 1000),
    },
  });

  await sendOtpEmail(email, code);

  return { message: 'OTP resent to your email' };
};

// Login: verify credentials, update lastLoginAt
const login = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user) {
    throw { statusCode: 401, message: 'Invalid email or password' };
  }

  if (!user.isActive) {
    throw { statusCode: 403, message: 'Account is deactivated' };
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    throw { statusCode: 401, message: 'Invalid email or password' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = generateToken({ id: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ id: user.id });
  await createSession(user.id, refreshToken);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.profile?.name,
      isVerified: user.isVerified,
      isActive: user.isActive,
      onboardingDone: user.profile?.onboardingDone,
      createdAt: user.createdAt,
    },
    token,
    refreshToken,
  };
};

// Get current user with full profile
const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!user) {
    throw { statusCode: 404, message: 'User not found' };
  }

  return {
    id: user.id,
    email: user.email,
    isVerified: user.isVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    profile: user.profile,
  };
};

// Refresh token
const refreshUserToken = async (refreshToken) => {
  const { session, userId } = await findValidRefreshSession(refreshToken);

  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true },
    include: { profile: true },
  });

  if (!user) {
    throw { statusCode: 404, message: 'User not found or deactivated' };
  }

  const token = generateToken({ id: user.id, email: user.email });
  const newRefreshToken = generateRefreshToken({ id: user.id });
  await rotateSessionRefreshToken(session, newRefreshToken);

  return { token, refreshToken: newRefreshToken };
};

// Change password (authenticated). All sessions are revoked and a fresh
// token pair is issued so the current device stays logged in.
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw { statusCode: 404, message: 'User not found' };
  }

  const isMatch = await comparePassword(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw { statusCode: 401, message: 'Current password is incorrect' };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.userSession.deleteMany({ where: { userId } });

  const token = generateToken({ id: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ id: user.id });
  await createSession(user.id, refreshToken);

  return { token, refreshToken };
};

// Forgot password: send a reset OTP. The response is identical whether the
// email exists or not (no account enumeration).
const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.isActive) {
    await prisma.otpCode.updateMany({
      where: { email, purpose: 'reset', used: false },
      data: { used: true },
    });

    const code = generateOtp();
    const expiryMin = Number(process.env.OTP_EXPIRY_MINUTES) || 10;
    await prisma.otpCode.create({
      data: {
        email,
        purpose: 'reset',
        code,
        expiresAt: new Date(Date.now() + expiryMin * 60 * 1000),
      },
    });

    await sendPasswordResetEmail(email, code);
  }

  return { message: 'If this email exists, a reset code has been sent' };
};

// Reset password with the emailed OTP. Revokes every session.
const resetPassword = async (email, code, newPassword) => {
  await findAndConsumeOtp(email, code, 'reset');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw { statusCode: 400, message: 'Invalid or expired OTP code' };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await prisma.userSession.deleteMany({ where: { userId: user.id } });

  return { message: 'Password reset successfully' };
};

// Active sessions of the user. The caller may pass its refresh token so its
// own session can be flagged (isCurrent) in the list.
const listSessions = async (userId, currentRefreshToken) => {
  const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
  const sessions = await prisma.userSession.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    lastRefreshedAt: s.updatedAt,
    expiresAt: s.expiresAt,
    isCurrent: currentHash != null && s.refreshToken === currentHash,
  }));
};

const revokeSession = async (userId, sessionId) => {
  const { count } = await prisma.userSession.deleteMany({
    where: { id: sessionId, userId },
  });
  if (count === 0) {
    throw { statusCode: 404, message: 'Session not found' };
  }
  return { revoked: count };
};

// Logout: revoke the session bound to this refresh token,
// or every session of the user when no token is provided (global logout)
const logout = async (userId, refreshToken) => {
  const where = refreshToken
    ? { userId, refreshToken: hashRefreshToken(refreshToken) }
    : { userId };
  const { count } = await prisma.userSession.deleteMany({ where });
  return { revoked: count };
};

// Google OAuth 2.0: verify token, login existing user or create new user directly
const googleAuth = async (idToken) => {
  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      ],
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw { statusCode: 401, message: 'Invalid Google token' };
  }

  if (!payload) {
    throw { statusCode: 401, message: 'Invalid Google token payload' };
  }

  const { email: rawEmail, name, email_verified, picture } = payload;
  if (!email_verified) {
    throw { statusCode: 400, message: 'Google email not verified' };
  }

  // Same normalization as the express-validator chains (lowercase, gmail dots
  // stripped) so Google sign-in and email/password resolve to the same account
  const email = validator.normalizeEmail(rawEmail) || rawEmail.toLowerCase();

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (existingUser) {
    if (!existingUser.isActive) {
      throw { statusCode: 403, message: 'Account is deactivated' };
    }

    await prisma.user.update({
      where: { id: existingUser.id },
      data: { lastLoginAt: new Date() },
    });

    // Refresh the Google profile photo at every login
    if (picture) {
      await prisma.userProfile.upsert({
        where: { userId: existingUser.id },
        update: { avatarUrl: picture },
        create: { userId: existingUser.id, avatarUrl: picture },
      });
    }

    const token = generateToken({ id: existingUser.id, email: existingUser.email });
    const refreshToken = generateRefreshToken({ id: existingUser.id });
    await createSession(existingUser.id, refreshToken);

    return {
      user: {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.profile?.name || existingUser.name || '',
        isVerified: true,
        onboardingDone: existingUser.profile?.onboardingDone ?? false,
      },
      token,
      refreshToken,
    };
  }

  // New Google user → create user + profile directly (email already verified by Google)
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(randomPassword);

  const user = await prisma.user.create({
    data: {
      email,
      name: name || '',
      passwordHash,
      isVerified: true,
      profile: {
        create: {
          name: name || '',
          avatarUrl: picture || null,
          onboardingDone: false,
        },
      },
    },
    include: { profile: true },
  });

  const token = generateToken({ id: user.id, email: user.email });
  const refreshToken = generateRefreshToken({ id: user.id });
  await createSession(user.id, refreshToken);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.profile?.name,
      isVerified: true,
      onboardingDone: false,
    },
    token,
    refreshToken,
  };
};

module.exports = {
  register,
  login,
  getMe,
  refreshUserToken,
  verifyOtp,
  resendOtp,
  googleAuth,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  listSessions,
  revokeSession,
};
