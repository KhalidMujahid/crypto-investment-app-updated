const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  kycStatus: { 
    type: String, 
    enum: ['not_started', 'pending', 'verified', 'rejected'], 
    default: 'not_started' 
  },
  kycDocuments: [{
    documentType: String,
    documentUrl: String,
    uploadedAt: Date
  }],
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  referralCode: { type: String, unique: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'dark' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      priceAlerts: { type: Boolean, default: false }
    }
  },
  security: {
    lastLogin: Date,
    loginHistory: [{
      date: Date,
      ip: String,
      userAgent: String,
      location: String
    }],
    devices: [{
      name: String,
      os: String,
      browser: String,
      lastUsed: Date
    }]
  },
  status: { type: String, enum: ['active', 'suspended', 'banned'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model('User', userSchema);