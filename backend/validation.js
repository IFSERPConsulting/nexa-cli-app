const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./users');

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const validateRegistration = [
  body('username').trim().isLength({ min: 3 }).escape(),
  body('password').custom((value) => {
    if (!passwordRegex.test(value)) {
      throw new Error('Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.');
    }
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

const validateCommand = [
  body('command')
    .isString()
    .bail()
    .custom((value) => {
      if (!value || !value.trim()) {
        throw new Error('Command is required.');
      }
      if (value.length > 5000) {
        throw new Error('Command is too long (max 5000 characters).');
      }
      return true;
    }),
  body('model')
    .optional()
    .isString()
    .withMessage('Model must be a string.')
    .isLength({ min: 1, max: 255 })
    .withMessage('Model value is invalid.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { validateRegistration, validateCommand, authenticate };
