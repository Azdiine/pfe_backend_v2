const authService = require('./auth.service');
const { success, error } = require('../../utils/response');

const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name);
    return success(res, result, 'Registration successful', 201);
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    return success(res, result, 'Login successful');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.id);
    return success(res, user, 'User retrieved');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return error(res, 'Refresh token is required', 400);
    }
    const tokens = await authService.refreshUserToken(refreshToken);
    return success(res, tokens, 'Token refreshed');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await authService.verifyOtp(email, code);
    return success(res, result, 'Email verified successfully');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await authService.resendOtp(email);
    return success(res, result, 'OTP resent');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

const googleAuth = async (req, res, next) => {
  try {
    const { idToken, tokenId, credential } = req.body;
    const token = idToken || tokenId || credential;
    if (!token) {
      return error(res, 'Google ID token is required', 400);
    }
    const result = await authService.googleAuth(token);
    return success(res, result, 'Login successful');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
};

module.exports = { register, login, getMe, refresh, verifyOtp, resendOtp, googleAuth };
