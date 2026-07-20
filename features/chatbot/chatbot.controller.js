const chatbotService = require('./chatbot.service');
const { success, error } = require('../../utils/response');

const sendMessage = async (req, res, next) => {
  try {
    const result = await chatbotService.sendMessage(req.user.id, req.body);
    return success(res, result, 'Message sent');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const getHistory = async (req, res, next) => {
  try {
    const messages = await chatbotService.getHistory(req.user.id, req.query.sessionId);
    return success(res, messages, 'History loaded');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

const clearHistory = async (req, res, next) => {
  try {
    const result = await chatbotService.clearHistory(req.user.id, req.query.sessionId);
    return success(res, result, 'History cleared');
  } catch (err) {
    if (err.statusCode) return error(res, err.message, err.statusCode);
    next(err);
  }
};

module.exports = { sendMessage, getHistory, clearHistory };
