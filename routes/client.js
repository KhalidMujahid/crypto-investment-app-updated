const express = require('express');
const { ensureAuth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const Notification = require("../models/Notification");
const axios = require("axios");
const router = express.Router();


router.get("/dashboard", ensureAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5);

    const wallets = await Wallet.find({ user: req.user.id });

    let totalValue = 0;
    wallets.forEach((wallet) => {
      totalValue += wallet.balance * (wallet.currentPrice || 1);
    });

    const { data: global } = await axios.get(
      "https://api.coingecko.com/api/v3/global"
    );


    const { data: market } = await axios.get(
      "https://api.coingecko.com/api/v3/coins/markets",
      {
        params: {
          vs_currency: "usd",
          order: "market_cap_desc",
          per_page: 50,
          page: 1,
          sparkline: true,
          price_change_percentage: "24h",
        },
      }
    );

    const sorted = [...market].sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h
    );

    const topGainers = sorted.slice(0, 5);
    const topLosers = sorted.slice(-5).reverse();

    res.render("client/dashboard", {
      user: req.user,
      transactions,
      wallets,
      totalValue,
      title: "Dashboard",
      global: global.data,
      topGainers,
      topLosers,
      market: market.slice(0, 10), 
    });
  } catch (err) {
    console.error(err);
    res.render("error", { error: err });
  }
});

// Portfolio page
// router.get('/portfolio', ensureAuth, async (req, res) => {
//   try {
//     const wallets = await Wallet.find({ user: req.user.id });
//     res.render('client/portfolio', { user: req.user, wallets, title: 'Portfolio' });
//   } catch (err) {
//     res.render('error', { error: err });
//   }
// });

// Transactions page
router.get('/transactions', ensureAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const transactions = await Transaction.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Transaction.countDocuments({ user: req.user.id });
    
    res.render('client/transactions', {
      user: req.user,
      transactions,
      currentPage: page,
      total: total,
      totalPages: Math.ceil(total / limit),
      title: 'Transactions'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// Deposit page
// router.get('/deposit', ensureAuth, async (req, res) => {
//   try {
//     // Get deposit wallet address from system settings or database
//     const depositWallet = await Wallet.findOne({ isDepositWallet: true });
    
//     res.render('client/deposit', {
//       user: req.user,
//       depositAddress: depositWallet?.address,
//       title: 'Deposit'
//     });
//   } catch (err) {
//     res.render('error', { error: err });
//   }
// });

// Withdrawal page
router.get('/withdraw', ensureAuth, async (req, res) => {
  try {
    const wallets = await Wallet.find({ user: req.user.id, balance: { $gt: 0 } });
    res.render('client/withdraw', { user: req.user,error: null,success: null, title: 'Withdraw' });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// Profile page
router.get('/profile', ensureAuth, (req, res) => {
  res.render('client/profile', { user: req.user, title: 'Profile' });
});

// Notifications page
router.get('/notifications', ensureAuth, async (req, res) => {
  try {
    // Fetch user notifications from database
    res.render('client/notifications', { user: req.user, title: 'Notifications' });
  } catch (err) {
    res.render('error', { error: err });
  }
});

// Handle deposit form submission
router.post('/deposit', ensureAuth, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    
    // Create a pending deposit transaction
    const transaction = new Transaction({
      user: req.user.id,
      type: 'deposit',
      asset: currency,
      amount: parseFloat(amount),
      status: 'pending'
    });
    
    await transaction.save();
    
    // Create notification
    const notification = new Notification({
      user: req.user.id,
      title: 'Deposit Initiated',
      message: `Your deposit of ${amount} ${currency} is being processed.`,
      type: 'transaction'
    });
    
    await notification.save();
    
    res.redirect('/client/transactions');
  } catch (err) {
    console.error('Deposit error:', err);
    res.render('error', { error: err });
  }
});

// Handle withdrawal request
router.post('/withdraw', ensureAuth, async (req, res) => {
  try {
    const { amount, address } = req.body;

    if (req.user.kycStatus !== 'verified') {
      req.flash('error', 'Your account is not verified. Please complete KYC to withdraw.');
      return res.redirect('/client/withdraw');
    }

    const wallet = await Wallet.findOne({ user: req.user.id });
    if (!wallet || wallet.balance < parseFloat(amount)) {
      req.flash('error', 'Insufficient balance');
      return res.redirect('/client/withdraw');
    }

    const transaction = new Transaction({
      user: req.user.id,
      type: 'withdrawal',
      asset: "BTC",
      amount: parseFloat(amount),
      address,
      status: 'pending'
    });

    await transaction.save();

    wallet.lockedBalance += parseFloat(amount);
    wallet.balance -= parseFloat(amount);
    await wallet.save();

    const notification = new Notification({
      user: req.user.id,
      title: 'Withdrawal Requested',
      message: `Your withdrawal of ${amount} ${currency} is pending approval.`,
      type: 'transaction'
    });

    await notification.save();

    res.redirect('/client/transactions');
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.render('error', { error: err });
  }
});


// Get notifications API endpoint
router.get('/notifications/data', ensureAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.post('/notifications/:id/read', ensureAuth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// KYC upload
router.post('/kyc/upload', ensureAuth, async (req, res) => {
  try {
    // In a real application, you would handle file upload here
    // For this example, we'll just simulate the process
    
    req.user.kycStatus = 'pending';
    req.user.kycDocuments.push({
      documentType: req.body.documentType,
      documentUrl: '/uploads/kyc/sample.jpg', // This would be the uploaded file path
      uploadedAt: new Date()
    });
    
    await req.user.save();
    
    // Create notification
    const notification = new Notification({
      user: req.user.id,
      title: 'KYC Documents Submitted',
      message: 'Your KYC documents have been submitted for verification.',
      type: 'info'
    });
    
    await notification.save();
    
    res.redirect('/client/profile');
  } catch (err) {
    console.error('KYC upload error:', err);
    res.render('error', { error: err });
  }
});

// Toggle 2FA
router.post('/toggle-2fa', ensureAuth, async (req, res) => {
  try {
    req.user.twoFactorEnabled = !req.user.twoFactorEnabled;
    await req.user.save();
    
    res.redirect('/client/profile');
  } catch (err) {
    console.error('2FA toggle error:', err);
    res.render('error', { error: err });
  }
});

// Update profile
router.post('/profile', ensureAuth, async (req, res) => {
  try {
    const { firstName, lastName, email, theme, notifications } = req.body;
    
    req.user.firstName = firstName;
    req.user.lastName = lastName;
    req.user.email = email;
    req.user.preferences.theme = theme;
    req.user.preferences.notifications = {
      email: notifications && notifications.includes('email'),
      push: notifications && notifications.includes('push'),
      priceAlerts: notifications && notifications.includes('priceAlerts')
    };
    
    await req.user.save();
    
    res.redirect('/client/profile');
  } catch (err) {
    console.error('Profile update error:', err);
    res.render('error', { error: err });
  }
});

module.exports = router;