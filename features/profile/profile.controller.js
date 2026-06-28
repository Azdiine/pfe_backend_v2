const profileService = require('./profile.service');
const { success, error } = require('../../utils/response');

const saveOnboarding = async (req, res, next) => {
  try {
    const profile = await profileService.saveOnboarding(req.user.id, req.body);
    return success(res, profile, 'Onboarding saved successfully');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const profile = await profileService.getProfile(req.user.id);
    return success(res, profile, 'Profile loaded');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await profileService.updateProfile(req.user.id, req.body);
    return success(res, profile, 'Profile updated');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

module.exports = { saveOnboarding, getProfile, updateProfile };
