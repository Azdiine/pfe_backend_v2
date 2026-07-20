const { body } = require('express-validator');

const sendMessageValidation = [
  body('message').isString().trim().isLength({ min: 1, max: 2000 })
    .withMessage('message is required (1-2000 characters)'),
  body('sessionId').optional().isUUID().withMessage('sessionId must be a valid UUID'),
];

module.exports = { sendMessageValidation };
