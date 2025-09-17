const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'trade', 'swap', 'staking', 'reward'], 
    required: true 
  },
  asset: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed', 'rejected', 'processing'], 
    default: 'pending' 
  },
  address: String, // For deposits/withdrawals
  txHash: String, // Blockchain transaction hash
  confirmations: { type: Number, default: 0 },
  requiredConfirmations: { type: Number, default: 3 },
  fee: { type: Number, default: 0 },
  network: String,
  fromAddress: String,
  toAddress: String,
  details: mongoose.Schema.Types.Mixed, 
  completedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Index for faster queries
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ txHash: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);