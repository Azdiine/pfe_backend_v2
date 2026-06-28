const { body } = require('express-validator');

const recommendValidation = [
  body('ingredients')
    .isArray({ min: 1 })
    .withMessage('ingredients must be a non-empty array'),
  body('ingredients.*')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('each ingredient must be a non-empty string'),
  body('top_k')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('top_k must be between 1 and 20')
];

const barcodeValidation = [
  body('barcode')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('barcode is required and must be a non-empty string'),
  body('top_k')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('top_k must be between 1 and 20')
];

module.exports = {
  recommendValidation,
  barcodeValidation
};
