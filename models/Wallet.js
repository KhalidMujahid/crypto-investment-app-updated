const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  address: { type: String, required: true, unique: true },
  currency: { type: String, required: true }, // BTC, ETH, USDT, etc.
  balance: { type: Number, default: 0 },
  lockedBalance: { type: Number, default: 0 }, // For pending withdrawals
  isDepositWallet: { type: Boolean, default: false }, // System deposit wallet
  isColdWallet: { type: Boolean, default: false }, // For admin cold storage management
  label: String,
  createdAt: { type: Date, default: Date.now }
});

// Index for user wallets
walletSchema.index({ user: 1, currency: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', walletSchema);