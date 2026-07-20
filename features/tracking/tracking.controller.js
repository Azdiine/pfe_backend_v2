const trackingService = require('./tracking.service');
const { success, error } = require('../../utils/response');

const addMeal = async (req, res, next) => {
  try {
    const log = await trackingService.addMeal(req.user.id, req.body);
    return success(res, log, 'Meal added to daily log');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const deleteMeal = async (req, res, next) => {
  try {
    const log = await trackingService.deleteMeal(req.user.id, req.params.id);
    return success(res, log, 'Meal entry deleted');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const addWater = async (req, res, next) => {
  try {
    const log = await trackingService.addWater(req.user.id, req.body);
    return success(res, log, 'Water added to daily log');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const updateDay = async (req, res, next) => {
  try {
    const log = await trackingService.updateDay(req.user.id, req.body);
    return success(res, log, 'Daily log updated');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const getDay = async (req, res, next) => {
  try {
    const log = await trackingService.getDay(req.user.id, req.query.date);
    return success(res, log, 'Daily log loaded');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const getRange = async (req, res, next) => {
  try {
    const logs = await trackingService.getRange(req.user.id, req.query.days);
    return success(res, logs, 'Logs loaded');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

module.exports = { addMeal, deleteMeal, addWater, updateDay, getDay, getRange };
