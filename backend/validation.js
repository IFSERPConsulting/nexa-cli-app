const { body, validationResult } = require('express-validator');

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
  body('command').trim().isLength({ min: 1 }).escape(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];

module.exports = { validateRegistration, validateCommand };
