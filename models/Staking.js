const mongoose = require('mongoose');

const stakingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  asset: { type: String, required: true },
  amount: { type: Number, required: true },
  duration: { type: Number, required: true },
  apy: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  endDate: Date,
  status: { 
    type: String, 
    enum: ['active', 'completed', 'cancelled'], 
    default: 'active' 
  },
  rewards: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Staking', stakingSchema);