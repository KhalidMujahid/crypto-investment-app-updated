const express = require('express');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Notification = require("../models/Notification");
const Wallet = require('../models/Wallet');
const nodemailer = require("nodemailer");
const router = express.Router();


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "advancedstrading@gmail.com",
    pass: "viwh iefs gncz ggpl "
  }
});

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
    const depositWallet = await Wallet.find();
    
    res.render('client/deposit', {
      user: req.user,
      depositAddress: depositWallet?.address,
      title: 'Deposit'
    });
  } catch (err) {
    res.render('error', { error: err });
  }
});


// GET /admin/users
router.get("/users", ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.render("admin/users", { users });
  } catch (err) {
    res.render("error", { error: err });
  }
});

// GET /admin/users/:id
router.get("/users/:id", ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).render("error", { error: { message: "User not found" } });
    }

    const wallets = await Wallet.find({ user: user._id });

    res.render("admin/user-details", { user, wallets });
  } catch (err) {
    res.render("error", { error: err });
  }
});


// POST /admin/users/:id/wallets/:walletId/update
router.post("/users/:id/wallets/:walletId/update", ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { balance, lockedBalance } = req.body;

    await Wallet.findByIdAndUpdate(req.params.walletId, {
      balance,
      lockedBalance
    });

    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    res.render("error", { error: err });
  }
});

// POST /users/:id/wallets/create
router.post("/users/:id/wallets/create", ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { currency, address, balance } = req.body;
    await Wallet.create({
      user: req.params.id,
      currency,
      address,
      balance
    });
    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    res.render("error", { error: err });
  }
});

// List all users with pending KYC
router.get("/users/kyc/pending", async (req, res) => {
  try {
    const users = await User.find({ kycStatus: "pending" }).lean();

    res.render("admin/kyc-pending", { user: req.user, users });
  } catch (err) {
    console.error("Pending KYC GET error:", err);
    res.status(500).render("error", { error: err });
  }
});

// GET route - show KYC verification page for a user
router.get("/users/:id/kyc", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();

    if (!user) {
      return res.status(404).render("error", { error: { message: "User not found" } });
    }

    res.render("admin/kyc", { user });
  } catch (err) {
    console.error("KYC GET error:", err);
    res.status(500).render("error", { error: err });
  }
});

// POST route - update KYC status
router.post("/users/:id/kyc/update", async (req, res) => {
  try {
    const { action, notes } = req.body;
    const { id } = req.params;

    let kycStatus = "pending";
    if (action === "approve") kycStatus = "verified";
    if (action === "reject") kycStatus = "rejected";

    const user = await User.findByIdAndUpdate(
      id,
      {
        kycStatus,
        kycNotes: notes || "",
        kycReviewedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .render("error", { error: { message: "User not found" } });
    }


    let subject = "KYC Verification Update";
    let message = `
      <h2>KYC Status Update</h2>
      <p>Hi ${user.firstName || "User"},</p>
      <p>Your KYC verification status has been updated.</p>
      <p><strong>Status:</strong> ${kycStatus.toUpperCase()}</p>
      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
      <br/>
      <p>Thank you,<br/>Advanced Trading Team</p>
    `;

    const mailOptions = {
      from: `"Advanced Trading Support" advancedstrading@gmail.com`,
      to: user.email,
      subject,
      html: message,
    };

    await transporter.sendMail(mailOptions);

    req.flash("success", `KYC ${kycStatus} for ${user.email}`);
    res.redirect(`/admin/users/${id}/kyc`);
  } catch (err) {
    console.error("KYC POST error:", err);
    res.status(500).render("error", { error: err });
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
      total,
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

    let emailSubject = "Withdrawal Update";
    let emailMessage = "";

    if (action === 'approve') {
      transaction.status = 'completed';
      transaction.completedAt = new Date();

      const notification = new Notification({
        user: transaction.user._id,
        title: 'Withdrawal Approved',
        message: `Your withdrawal of $${transaction.amount} has been approved.`,
        type: 'success'
      });
      await notification.save();

      emailSubject = "Withdrawal Approved";
      emailMessage = `
        <h2>Withdrawal Approved</h2>
        <p>Hi ${transaction.user.firstName || "User"},</p>
        <p>Your withdrawal has been approved.</p>
        <p><strong>Amount:</strong> $${transaction.amount}</p>
        <p>Status: Completed</p>
        <br/>
        <p>Thank you,<br/>Advanced Trading Team</p>
      `;
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
      
      const notification = new Notification({
        user: transaction.user._id,
        title: 'Withdrawal Rejected',
        message: `Your withdrawal of $${transaction.amount} has been rejected.`,
        type: 'error'
      });
      await notification.save();

      emailSubject = "Withdrawal Rejected";
      emailMessage = `
        <h2>Withdrawal Rejected</h2>
        <p>Hi ${transaction.user.firstName || "User"},</p>
        <p>Unfortunately, your withdrawal request has been rejected.</p>
        <p><strong>Amount:</strong> $${transaction.amount}</p>
        <p>Status: Rejected</p>
        <br/>
        <p>Thank you,<br/>Advanced Trading Team</p>
      `;
    }

    await transaction.save();


    const mailOptions = {
      from: `"Advanced Trading Support" advancedstrading@gmail.com`,
      to: transaction.user.email,
      subject: emailSubject,
      html: emailMessage
    };

    await transporter.sendMail(mailOptions);

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
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { kycStatus: status },
      { new: true }
    );

    if (!user) {
      return res.status(404).render("error", { error: { message: "User not found" } });
    }

    // Create notification for user
    const notification = new Notification({
      user: req.params.id,
      title: 'KYC Status Updated',
      message: `Your KYC verification has been ${status}.`,
      type: status === 'verified' ? 'success' : 'error'
    });
    await notification.save();

    const mailOptions = {
      from: `"Advanced Trading Support" advancedstrading@gmail.com`,
      to: user.email,
      subject: "KYC Verification Status Updated",
      html: `
        <h2>KYC Status Update</h2>
        <p>Hi ${user.firstName || "User"},</p>
        <p>Your KYC verification status has been updated.</p>
        <p><strong>Status:</strong> ${status.toUpperCase()}</p>
        <br/>
        <p>Thank you,<br/>Advanced Trading Team</p>
      `
    };

    await transporter.sendMail(mailOptions);

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