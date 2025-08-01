const mongoose = require("mongoose");

const GarageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    logo: { type: String, default: null },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Admin Password
    approved: { type: Boolean, default: false }, // Super admin approves it
    gstNum: { type: String, default: null },
    panNum: { type: String, default: null },
    subscriptionType: {
      type: String,
      // enum: ["3_months", "6_months", "1_year"],
      // required: true,
    },
    subscriptionStart: {
      type: Date,
      default: Date.now,
    },
    subscriptionEnd: {
      type: Date,
    },
    isSubscribed: {
      type: Boolean,
      default: false,
    },
    isVerified: { type: Boolean, default: false },
    activeToken: { type: String, default: null },
    // Bank details
    bankDetails: {
      accountHolderName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      ifscCode: { type: String, default: null },
      bankName: { type: String, default: null },
      branchName: { type: String, default: null },
      upiId: { type: String, default: null },
    },
    paymentDetails: {
      paymentId: String, // e.g. Razorpay/Stripe transaction ID
      amount: Number,
      method: String, // e.g. "card", "upi", "netbanking"
      status: String, // e.g. "paid", "pending", "failed"
    },
  },
  { timestamps: true }
);

const Garage = mongoose.model("Garage", GarageSchema);
module.exports = Garage;
