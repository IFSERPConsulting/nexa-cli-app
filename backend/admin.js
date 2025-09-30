const isAdmin = (req, res, next) => {
  if (req.user.username !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }
  next();
};

module.exports = { isAdmin };
