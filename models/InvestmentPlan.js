const mongoose = require('mongoose');

const investmentPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  minAmount: { type: Number, required: true },
  maxAmount: Number,
  duration: { type: Number, required: true }, // in days
  apy: { type: Number, required: true }, // annual percentage yield
  isActive: { type: Boolean, default: true },
  features: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InvestmentPlan', investmentPlanSchema);