const express = require('express');
const router = express.Router();
const chatbotController = require('./chatbot.controller');
const authMiddleware = require('../../middlewares/auth.middleware');
const { sendMessageValidation } = require('./chatbot.validation');
const validate = require('../../middlewares/validate.middleware');

// POST /api/chatbot/message — send a message to Meatay Assistant
router.post('/message', authMiddleware, sendMessageValidation, validate, chatbotController.sendMessage);

// GET /api/chatbot/history — chat history (optional ?sessionId=)
router.get('/history', authMiddleware, chatbotController.getHistory);

// DELETE /api/chatbot/history — clear chat history (optional ?sessionId=)
router.delete('/history', authMiddleware, chatbotController.clearHistory);

module.exports = router;
