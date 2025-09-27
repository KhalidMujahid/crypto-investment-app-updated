const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  address: { type: String, required: true },
  currency: { type: String, required: true, default: "BTC" },
  balance: { type: Number, default: 0 },
  lockedBalance: { type: Number, default: 0 },
  isDepositWallet: { type: Boolean, default: false }, 
  isColdWallet: { type: Boolean, default: false },
  label: String,
  createdAt: { type: Date, default: Date.now }
});


walletSchema.index({ user: 1, currency: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', walletSchema);