const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

// Fail fast: without a strong secret, every token in the app can be forged.
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET is missing or too short (min 32 chars). ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
}

// The `type` claim prevents a refresh token (30d lifetime) from being
// accepted by authMiddleware in place of a short-lived access token.
const generateToken = (payload) => {
  return jwt.sign({ ...payload, type: 'access' }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
};

const generateRefreshToken = (payload) => {
  // jti : deux refresh tokens émis dans la même seconde pour le même user
  // auraient sinon un payload identique, donc le même JWT — la rotation
  // produirait un "nouveau" token égal à l'ancien.
  return jwt.sign({ ...payload, type: 'refresh', jti: crypto.randomUUID() }, JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
};

const verifyToken = (token, expectedType = 'access') => {
  const payload = jwt.verify(token, JWT_SECRET);
  // Legacy tokens (issued before the type claim existed) have no `type`;
  // they are rejected so old long-lived tokens can't bypass the check.
  if (payload.type !== expectedType) {
    const err = new Error(`Invalid token type: expected ${expectedType}`);
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
};

const verifyRefreshToken = (token) => verifyToken(token, 'refresh');

module.exports = { generateToken, generateRefreshToken, verifyToken, verifyRefreshToken };
