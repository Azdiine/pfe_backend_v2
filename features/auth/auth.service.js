const prisma = require('../../config/prisma');
const { hashPassword, comparePassword } = require('../../utils/hash');
const { generateToken, generateRefreshToken, verifyToken } = require('../../utils/jwt');
const { sendOtpEmail } = require('../../utils/email');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

// Generate 6-digit OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();

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
  const refreshTokenHash = await hashPassword(refreshToken);
  const expiresAt = new Date(Date.now() + parseExpiryToMs(process.env.JWT_REFRESH_EXPIRES_IN || '30d'));
  return prisma.userSession.create({
    data: {
      userId,
      refreshToken: refreshTokenHash,
      expiresAt,
    },
  });
};

const findValidRefreshSession = async (refreshToken) => {
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch (err) {
    throw { statusCode: 401, message: 'Invalid refresh token' };
  }

  if (!payload?.id) {
    throw { statusCode: 401, message: 'Invalid refresh token payload' };
  }

  const sessions = await prisma.userSession.findMany({ where: { userId: payload.id } });

  for (const session of sessions) {
    if (session.expiresAt < new Date()) {
      continue;
    }
    const match = await comparePassword(refreshToken, session.refreshToken);
    if (match) {
      return { session, userId: payload.id };
    }
  }

  throw { statusCode: 401, message: 'Refresh token not valid or expired' };
};

const rotateSessionRefreshToken = async (session, newRefreshToken) => {
  const refreshTokenHash = await hashPassword(newRefreshToken);
  const expiresAt = new Date(Date.now() + parseExpiryToMs(process.env.JWT_REFRESH_EXPIRES_IN || '30d'));
  return prisma.userSession.update({
    where: { id: session.id },
    data: { refreshToken: refreshTokenHash, expiresAt },
  });
};

// Register: NO user created yet — just store OTP with registration data + send email
const register = async (email, password, name) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw { statusCode: 409, message: 'Email already registered' };
  }

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
  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      email,
      code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpRecord) {
    throw { statusCode: 400, message: 'Invalid or expired OTP code' };
  }

  // Check if user was already created (double submit)
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    await prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });
    throw { statusCode: 409, message: 'Account already exists' };
  }

  // Mark OTP as used
  await prisma.otpCode.update({ where: { id: otpRecord.id }, data: { used: true } });

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

  const { email, name, email_verified } = payload;
  if (!email_verified) {
    throw { statusCode: 400, message: 'Google email not verified' };
  }

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
        create: { name: name || '', onboardingDone: false },
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

module.exports = { register, login, getMe, refreshUserToken, verifyOtp, resendOtp, googleAuth };
