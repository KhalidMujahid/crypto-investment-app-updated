const User = require('../models/User');

// Check if user is authenticated
const ensureAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  
  if (req.session && req.session.userId) {
    return User.findById(req.session.userId)
      .then(user => {
        if (user) {
          req.user = user;
          return next();
        } else {
          req.session.destroy();
          return res.redirect('/login');
        }
      })
      .catch(err => {
        console.error('Auth middleware error:', err);
        return res.redirect('/login');
      });
  }
  
  res.redirect('/login');
};

// Check if user is admin
const ensureAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  
  req.flash('error', 'Admin access required');
  res.redirect('/client/dashboard');
};

module.exports = { ensureAuth, ensureAdmin };