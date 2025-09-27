const express = require("express");
const { ensureAuth } = require("../middleware/auth");
const Transaction = require("../models/Transaction");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const Notification = require("../models/Notification");
const nodemailer = require("nodemailer");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const router = express.Router();
const multer = require("multer");
const path = require("path");
const verifyPin = require("../middleware/verifyPin");

cloudinary.config({
  cloud_name: process.env.YOUR_CLOUD_NAME,
  api_key: process.env.YOUR_API_KEY,
  api_secret: process.env.YOUR_API_SECRET,
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "advancedstrading@gmail.com",
    pass: "viwh iefs gncz ggpl ",
  },
});

const storage = multer.diskStorage({});
const upload = multer({ storage });

router.get("/dashboard", ensureAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    const wallets = await Wallet.find({ user: req.user._id });

    let totalValue = 0;
    wallets.forEach((wallet) => {
      totalValue += wallet.balance * (wallet.currentPrice || 1);
    });

    res.render("client/dashboard", {
      user: req.user,
      transactions,
      wallets,
      totalValue,
      title: "Dashboard",
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
router.get("/transactions", ensureAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({ user: req.user._id });

    res.render("client/transactions", {
      user: req.user,
      transactions,
      currentPage: page,
      total: total,
      totalPages: Math.ceil(total / limit),
      title: "Transactions",
    });
  } catch (err) {
    res.render("error", { error: err });
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
router.get("/withdraw", ensureAuth, async (req, res) => {
    res.render("client/withdraw", {
      user: req.user,
      title: "Withdraw",
    });
});

// Profile page
router.get("/profile", ensureAuth, (req, res) => {
  res.render("client/profile", {
    user: req.user,
    title: "Profile",
  });
});

// Set / Change Withdrawal PIN
router.post("/set-pin", ensureAuth, async (req, res) => {
  try {
    const { pin, confirmPin } = req.body;

    if (!pin || !confirmPin) {
      req.flash("error", "PIN fields cannot be empty");
      return res.redirect("/client/profile");
    }

    if (pin !== confirmPin) {
      req.flash("error", "PINs do not match");
      return res.redirect("/client/profile");
    }

    if (pin.length < 4 || pin.length > 6) {
      req.flash("error", "PIN must be 4 to 6 digits");
      return res.redirect("/client/profile");
    }

    const hashedPin = await bcrypt.hash(pin, 12);

    const user = await User.findById(req.user._id);
    user.pin = hashedPin;
    await user.save();

    req.flash("success", "Withdrawal PIN set successfully");
    res.redirect("/client/profile");
  } catch (err) {
    console.error(err);
    req.flash("error", "Something went wrong");
    res.redirect("/client/profile");
  }
});

// Notifications page
router.get("/notifications", ensureAuth, async (req, res) => {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.render("client/notifications", {
      user: req.user,
      title: "Notifications",
      notifications,
    });
});

// Mark single notification as read
router.post("/notifications/:id/read", ensureAuth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } }
    );
    res.redirect("/client/notifications");
  } catch (err) {
    console.error(err);
    res.redirect("/client/notifications");
  }
});

// Mark all as read
router.post("/notifications/read-all", ensureAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.redirect("/client/notifications");
  } catch (err) {
    console.error(err);
    res.redirect("/client/notifications");
  }
});

// Handle deposit form submission
router.post("/deposit", ensureAuth, async (req, res) => {
  try {
    const { amount, currency } = req.body;

    // Create a pending deposit transaction
    const transaction = new Transaction({
      user: req.user._id,
      type: "deposit",
      asset: currency,
      amount: parseFloat(amount),
      status: "pending",
    });

    await transaction.save();

    // Create notification
    const notification = new Notification({
      user: req.user._id,
      title: "Deposit Initiated",
      message: `Your deposit of $${amount} ${currency} is being processed.`,
      type: "transaction",
    });

    await notification.save();

    res.redirect("/client/transactions");
  } catch (err) {
    console.error("Deposit error:", err);
    res.render("error", { error: err });
  }
});

// Handle withdrawal request
router.post("/withdraw", ensureAuth, verifyPin, async (req, res) => {
  try {
    const { amount, address, wallet: asset } = req.body;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      req.flash("error", "Please enter a valid withdrawal amount.");
      return res.redirect("/client/withdraw");
    }

    if (req.user.kycStatus !== "verified") {
      req.flash("error", "Your account is not verified. Please complete KYC to withdraw.");
      return res.redirect("/client/withdraw");
    }

    const lastWithdrawal = await Transaction.findOne({
      user: req.user._id,
      type: "withdrawal",
    }).sort({ createdAt: -1 });

    if (lastWithdrawal) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      if (lastWithdrawal.createdAt > sevenDaysAgo) {
        req.flash("error", "You can only place a new withdrawal 7 days after your last request.");
        return res.redirect("/client/withdraw");
      }
    }

    const wallet = await Wallet.findOne({ user: req.user._id });

    const amountNum = parseFloat(amount);

    const balance = parseFloat(wallet?.balance) || 0;

    if (balance < amountNum) {
      req.flash("error", "Insufficient balance to process this withdrawal.");
      return res.redirect("/client/withdraw");
    }

    const transaction = new Transaction({
      user: req.user._id,
      type: "withdrawal",
      asset,
      amount: amountNum,
      address,
      status: "pending",
    });
    await transaction.save();

    wallet.lockedBalance += amountNum;
    wallet.balance -= amountNum;
    await wallet.save();

    const notification = new Notification({
      user: req.user.id,
      title: "Withdrawal Requested",
      message: `Your withdrawal of $${amountNum} is pending approval.`,
      type: "transaction",
    });
    await notification.save();

    const mailOptions = {
      from: `Advanced Trading Support <advancedstrading@gmail.com>`,
      to: req.user.email,
      subject: "Withdrawal Request Submitted",
      html: `
        <h2>Withdrawal Request</h2>
        <p>Hi ${req.user.firstName || "User"},</p>
        <p>Your withdrawal request has been placed successfully.</p>
        <p><strong>Amount:</strong> $${amountNum}</p>
        <p><strong>Address:</strong> ${address}</p>
        <p>Status: Pending Approval</p>
        <br/>
        <p>Thank you,<br/>Advanced Trading Team</p>
      `,
    };
    await transporter.sendMail(mailOptions);

    req.flash("success", "Withdrawal request submitted successfully.");
    return res.redirect("/client/withdraw");

  } catch (err) {
    console.error("Withdrawal error:", err);
    req.flash("error", "Something went wrong while processing your withdrawal.");
    return res.redirect("/client/withdraw");
  }
});


// Get notifications API endpoint
router.get("/notifications/data", ensureAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
router.post("/notifications/:id/read", ensureAuth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// KYC upload
router.post(
  "/kyc/upload",
  ensureAuth,
  upload.single("document"),
  async (req, res) => {
    try {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "kyc-documents",
        resource_type: "auto",
      });

      req.user.kycStatus = "pending";
      req.user.kycDocuments.push({
        documentType: req.body.documentType,
        documentUrl: result.secure_url,
        uploadedAt: new Date(),
      });

      await req.user.save();

      // console.log(req.user);

      const notification = new Notification({
        user: req.user._id,
        title: "KYC Documents Submitted",
        message: "Your KYC documents have been submitted for verification.",
        type: "info",
      });

      await notification.save();
      
      req.flash("success","Your KYC documents have been submitted for verification.");
      res.redirect("/client/profile");
    } catch (err) {
      console.error("KYC upload error:", err);
      req.flash("error","An error occured please try again later");
      return res.redirect("/client/profile");
    }
  }
);

// Toggle 2FA
router.post("/toggle-2fa", ensureAuth, async (req, res) => {
  try {
    req.user.twoFactorEnabled = !req.user.twoFactorEnabled;
    await req.user.save();

    res.redirect("/client/profile");
  } catch (err) {
    console.error("2FA toggle error:", err);
    res.render("error", { error: err });
  }
});

// Update profile
router.post("/profile", ensureAuth, async (req, res) => {
  try {
    const { firstName, lastName, email, theme, notifications } = req.body;

    req.user.firstName = firstName;
    req.user.lastName = lastName;
    req.user.email = email;
    req.user.preferences.theme = theme;
    req.user.preferences.notifications = {
      email: notifications && notifications.includes("email"),
      push: notifications && notifications.includes("push"),
      priceAlerts: notifications && notifications.includes("priceAlerts"),
    };

    await req.user.save();

    res.redirect("/client/profile");
  } catch (err) {
    console.error("Profile update error:", err);
    res.render("error", { error: err });
  }
});

module.exports = router;
