const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const router = express.Router();

// Login page
router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Login',user: {} });
});

// Login processing
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('auth/login', { 
        title: 'Login', 
        error: 'Invalid email or password',
        email 
      });
    }
    
    // Check password
    const isMatch = await user.correctPassword(password, user.password);
    if (!isMatch) {
      return res.render('auth/login', { 
        title: 'Login', 
        error: 'Invalid email or password',
        email 
      });
    }
    
    // Check if account is suspended
    if (user.status !== 'active') {
      return res.render('auth/login', { 
        title: 'Login', 
        error: 'Account is suspended. Please contact support.',
        email 
      });
    }
    
    // Set session
    req.session.userId = user._id;
    req.session.save(() => {
      // Update last login
      user.security.lastLogin = new Date();
      user.security.loginHistory.push({
        date: new Date(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Keep only last 10 logins
      if (user.security.loginHistory.length > 10) {
        user.security.loginHistory = user.security.loginHistory.slice(-10);
      }
      
      user.save();
      
      // Redirect based on role
      if (user.role === 'admin') {
        res.redirect('/admin/dashboard');
      } else {
        res.redirect('/client/dashboard');
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', { 
      title: 'Login', 
      error: 'An error occurred during login. Please try again.' 
    });
  }
});

// Register page
router.get('/register', (req, res) => {
  res.render('auth/register', { title: 'Register' });
});

// Register processing
router.post('/register', async (req, res) => {
  try {
    const { email, password, confirmPassword, firstName, lastName, agreeTerms } = req.body;
    
    // Validation
    if (password !== confirmPassword) {
      return res.render('auth/register', { 
        title: 'Register', 
        error: 'Passwords do not match',
        email, firstName, lastName 
      });
    }
    
    if (!agreeTerms) {
      return res.render('auth/register', { 
        title: 'Register', 
        error: 'You must agree to the terms and conditions',
        email, firstName, lastName 
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render('auth/register', { 
        title: 'Register', 
        error: 'Email already registered',
        email, firstName, lastName 
      });
    }
    
    // Generate referral code
    const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    // Create user
    const newUser = new User({
      email,
      password,
      firstName,
      lastName,
      referralCode
    });
    
    await newUser.save();
    
    // Set session and redirect
    req.session.userId = newUser._id;
    req.session.save(() => {
      res.redirect('/client/dashboard');
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.render('auth/register', { 
      title: 'Register', 
      error: 'An error occurred during registration. Please try again.' 
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;