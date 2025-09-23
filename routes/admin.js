const express = require('express');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require("../models/Notification");
const Wallet = require('../models/Wallet');
const router = express.Router();

// Admin dashboard
router.get('/dashboard', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments({ role: 'user' });
    const pendingKyc = await User.countDocuments({ kycStatus: 'pending' });
    const pendingWithdrawals = await Transaction.countDocuments({ 
      type: 'withdrawal', 
      status: 'pending' 
    });
    
    res.render('admin/dashboard', {
      user: req.user,
      stats: { userCount, pendingKyc, pendingWithdrawals },
      title: 'Admin Dashboard'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// User management
router.get('/users', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const users = await User.find({ role: 'user' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await User.countDocuments({ role: 'user' });
    
    res.render('admin/users', {
      user: req.user,
      users,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      title: 'User Management'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// Deposit page
router.get('/deposit', ensureAuth,ensureAdmin, async (req, res) => {
  try {
    // Get deposit wallet address from system settings or database
    const depositWallet = await Wallet.findOne({ isDepositWallet: true });
    
    res.render('client/deposit', {
      user: req.user,
      depositAddress: depositWallet?.address,
      title: 'Deposit'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// Withdrawal requests
router.get('/withdrawals', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const pendingWithdrawals = await Transaction.find({ 
      type: 'withdrawal', 
      status: 'pending' 
    }).populate('user');
    
    res.render('admin/withdrawals', {
      user: req.user,
      withdrawals: pendingWithdrawals,
      title: 'Withdrawal Requests'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// Transaction oversight
router.get('/transactions', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const transactions = await Transaction.find()
      .populate('user')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Transaction.countDocuments();
    
    res.render('admin/transactions', {
      user: req.user,
      transactions,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      title: 'Transaction Oversight'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});


// Process withdrawal
router.post('/withdrawals/:id/process', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { action } = req.body;
    const transaction = await Transaction.findById(req.params.id).populate('user');
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    if (action === 'approve') {
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      

      const notification = new Notification({
        user: transaction.user._id,
        title: 'Withdrawal Approved',
        message: `Your withdrawal of ${transaction.amount} ${transaction.asset} has been approved.`,
        type: 'success'
      });
      
      await notification.save();
    } else if (action === 'reject') {
      transaction.status = 'rejected';
      
      // Return locked funds to user's balance
      const wallet = await Wallet.findOne({ 
        user: transaction.user._id, 
        currency: transaction.asset 
      });
      
      if (wallet) {
        wallet.lockedBalance -= transaction.amount;
        wallet.balance += transaction.amount;
        await wallet.save();
      }
      
      // Create notification for user
      const notification = new Notification({
        user: transaction.user._id,
        title: 'Withdrawal Rejected',
        message: `Your withdrawal of ${transaction.amount} ${transaction.asset} has been rejected.`,
        type: 'error'
      });
      
      await notification.save();
    }
    
    await transaction.save();
    
    res.redirect('/admin/withdrawals');
  } catch (err) {
    console.error('Withdrawal processing error:', err);
    res.render('error', { error: err });
  }
});

// Update user status
router.post('/users/:id/status', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await User.findByIdAndUpdate(req.params.id, { status });
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error('User status update error:', err);
    res.render('error', { error: err });
  }
});

// Verify KYC
router.post('/users/:id/kyc', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await User.findByIdAndUpdate(req.params.id, { kycStatus: status });
    
    // Create notification for user
    const notification = new Notification({
      user: req.params.id,
      title: 'KYC Status Updated',
      message: `Your KYC verification has been ${status}.`,
      type: status === 'verified' ? 'success' : 'error'
    });
    
    await notification.save();
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error('KYC update error:', err);
    res.render('error', { error: err });
  }
});

// System settings page
router.get('/settings', ensureAuth, ensureAdmin, (req, res) => {
  res.render('admin/settings', { user: req.user, title: 'System Settings' });
});

// Update system settings
router.post('/settings', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    req.flash('success', 'Settings updated successfully');
    res.redirect('/admin/settings');
  } catch (err) {
    console.error('Settings update error:', err);
    res.render('error', { error: err });
  }
});

// Update deposit wallet
router.post('/wallet/update', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { currency, address } = req.body;
    
    // Find existing wallet or create new
    let wallet = await Wallet.findOne({ currency, isDepositWallet: true });
    
    if (wallet) {
      wallet.address = address;
    } else {
      wallet = new Wallet({
        currency,
        address,
        isDepositWallet: true
      });
    }
    
    await wallet.save();
    
    req.flash('success', 'Deposit wallet updated successfully');
    res.redirect('/admin/settings');
  } catch (err) {
    console.error('Wallet update error:', err);
    res.render('error', { error: err });
  }
});

module.exports = router;