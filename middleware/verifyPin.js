const bcrypt = require("bcryptjs");
const User = require("../models/User.js");

const verifyPin = async (req, res, next) => {
  try {
    const { pin } = req.body;

    if (!pin) {
      req.flash("error", "Withdrawal PIN is required.");
      return res.redirect("/client/withdraw");
    }

    const user = await User.findById(req.user.id);

    if (!user || !user.pin) {
      req.flash("error", "No PIN set. Please set a withdrawal PIN first.");
      return res.redirect("/client/profile");
    }

    const isMatch = await bcrypt.compare(pin, user.pin);

    if (!isMatch) {
      req.flash("error", "Invalid PIN. Withdrawal blocked.");
      return res.redirect("/client/withdraw");
    }

    next(); 
  } catch (err) {
    console.error(err);
    req.flash("error", "Server error while verifying PIN.");
    res.redirect("/client/withdraw");
  }
};

module.exports = verifyPin;
