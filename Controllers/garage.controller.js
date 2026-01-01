const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Garage = require("../Model/garage.model");
const TempGarageRegistration = require("../Model/tempGarageRegistration.model");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const sendEmail = require("../Utils/mailer");
require("dotenv").config();
// const razorpay = require("../utils/razorpay");

// Submit Registration (store in temp)
const submitRegistration = async (req, res) => {
  try {
    const {
      name,
      address,
      phone,
      email,
      password,
      gstNum,
      panNum,
      bankDetails,
    } = req.body;

    // Check if garage already exists
    const existingGarage = await Garage.findOne({ email });
    if (existingGarage) {
      return res.status(400).json({ message: "Garage already exists" });
    }

    // Check if temp registration exists
    const existingTemp = await TempGarageRegistration.findOne({ email });
    if (existingTemp) {
      await TempGarageRegistration.deleteOne({ email });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store in temp collection
    const tempRegistration = new TempGarageRegistration({
      name,
      address,
      phone,
      email,
      password: hashedPassword,
      gstNum,
      panNum,
      bankDetails,
      otp,
      otpExpiresAt,
    });

    await tempRegistration.save();

    // Send OTP email
    await sendEmail(
      email,
      "Verify Your Garage Registration",
      `Your OTP code is: ${otp}. Valid for 10 minutes.`
    );

    res.status(200).json({
      message: "Registration submitted. Please check your email for OTP.",
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Verify OTP and Create Garage
const verifyRegistrationOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const tempRegistration = await TempGarageRegistration.findOne({
      email,
      otp,
      isVerified: false,
    });

    if (!tempRegistration) {
      return res.status(400).json({ message: "Invalid OTP or email" });
    }

    if (tempRegistration.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Create actual garage
    const newGarage = new Garage({
      name: tempRegistration.name,
      address: tempRegistration.address,
      phone: tempRegistration.phone,
      email: tempRegistration.email,
      password: tempRegistration.password,
      gstNum: tempRegistration.gstNum,
      panNum: tempRegistration.panNum,
      bankDetails: tempRegistration.bankDetails,
      isVerified: true,
    });

    await newGarage.save();

    // Delete temp registration
    await TempGarageRegistration.deleteOne({ email });

    // Generate JWT token
    const token = jwt.sign(
      { garageId: newGarage._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Garage registered successfully and verified!",
      garage: newGarage,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Resend Registration OTP
const sendRegistrationOTP = async (req, res) => {
  try {
    const { email } = req.body;

    const tempRegistration = await TempGarageRegistration.findOne({ email });
    if (!tempRegistration) {
      return res.status(404).json({
        message: "No pending registration found for this email",
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    tempRegistration.otp = otp;
    tempRegistration.otpExpiresAt = otpExpiresAt;
    await tempRegistration.save();

    // Send OTP email
    await sendEmail(
      email,
      "Your Registration OTP",
      `Your OTP code is: ${otp}. Valid for 10 minutes.`
    );

    res.status(200).json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const createGarage = async (req, res) => {
  try {
    const {
      name,
      address,
      phone,
      email,
      password,
      gstNum,
      panNum,
      durationInMonths, // e.g., 1, 3, 6, 12
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount,
      isFreePlan = false, // Optional flag for free plan
      bankDetails = {}, // Accept bank details
    } = req.body;
    const logoUrl = req.file?.path || null;

    const duration = Number(durationInMonths);
    if (!duration || isNaN(duration) || duration <= 0) {
      return res.status(400).json({ message: "Invalid subscription duration" });
    }

    // Razorpay Signature Validation - Skip if Free Plan
    if (!isFreePlan) {
      const body = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({ message: "Invalid Razorpay signature" });
      }
    }

    // Check for existing garage
    const existingGarage = await Garage.findOne({ email });
    if (existingGarage) {
      return res.status(400).json({ message: "Garage already exists" });
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + duration);

    const hashedPassword = await bcrypt.hash(password, 10);

    const newGarage = new Garage({
      name,
      address,
      phone,
      email,
      logo: logoUrl,
      password: hashedPassword,
      gstNum: gstNum,
      panNum: panNum,
      subscriptionType: `${duration}_months`,
      subscriptionStart: startDate,
      subscriptionEnd: endDate,
      isSubscribed: true,
      bankDetails, // Save bank details
      paymentDetails: isFreePlan
        ? {
            paymentId: null,
            amount: 0,
            method: "free",
            status: "free",
          }
        : {
            paymentId: razorpayPaymentId,
            amount,
            method: "razorpay",
            status: "paid",
          },
    });

    await newGarage.save();
    const token = jwt.sign(
      { garageId: newGarage._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );
    res.status(201).json({
      message:
        "Garage created and subscription activated. Waiting for admin approval.",
      garage: newGarage,
      token,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const garageLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const garage = await Garage.findOne({ email });

    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }
    if (!garage.isVerified) {
      return res.status(403).json({ message: "Garage not verified" });
    }
    if (!garage.approved) {
      return res.status(403).json({ message: "Garage not approved by admin" });
    }

    if (garage.subscriptionEnd && new Date() > garage.subscriptionEnd) {
      return res.status(403).json({
        message: "Your subscription has expired. Please renew your plan.",
        subscriptionExpired: true,
      });
    }
    // Prevent login if already logged in
    // if (garage.activeToken) {
    //   return res.status(403).json({
    //     message: "Already logged in on another device. Please logout first.",
    //   });
    // }
    const isMatch = await bcrypt.compare(password, garage.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Create token
    const token = jwt.sign({ garageId: garage._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    garage.activeToken = token;
    await garage.save();

    res.status(200).json({
      message: "Login successful",
      token,
      garage,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
const garageLogout = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.garageId); // assuming auth middleware sets this
    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    garage.activeToken = null;
    await garage.save();

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const renewGarageSubscription = async (req, res) => {
  try {
    const { garageId } = req.params;
    const { durationInMonths, paymentId, amount, method, status } = req.body;

    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    const currentDate = new Date();
    const newEndDate = new Date(
      currentDate.setMonth(currentDate.getMonth() + durationInMonths)
    );

    garage.subscriptionStart = new Date();
    garage.subscriptionEnd = newEndDate;
    garage.isSubscribed = true;
    garage.paymentDetails = {
      paymentId,
      amount,
      method,
      status,
    };

    await garage.save();

    res.status(200).json({
      message: "Subscription renewed successfully",
      garage,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
const updateGarageLogo = async (req, res) => {
  try {
    const garageId = req.params.id;
    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    const updatedGarage = await Garage.findByIdAndUpdate(
      garageId,
      { logo: req.file.path },
      { new: true }
    );

    if (!updatedGarage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    res
      .status(200)
      .json({ message: "Logo updated successfully", garage: updatedGarage });
  } catch (error) {
    console.error("Error updating logo:", error);
    res.status(500).json({ message: "Server error" });
  }
};
const getAllGarages = async (req, res) => {
  try {
    const garages = await Garage.find();
    res.status(200).json({ message: "Garages retrieved", garages });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
const getMe = async (req, res, next) => {
  try {
    const garage = await Garage.findById(req.garage.id);
    return res.status(200).json(garage);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};
const getGarageById = async (req, res) => {
  try {
    const garage = await Garage.findById(req.params.id);
    return res.status(200).json(garage);
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};
const updateGarage = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, email, gstNum, bankDetails } = req.body;

    const updatedGarage = await Garage.findByIdAndUpdate(
      id,
      { name, address, phone, email, gstNum, bankDetails },
      { new: true }
    );

    if (!updatedGarage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    res
      .status(200)
      .json({ message: "Garage updated successfully", updatedGarage });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const deleteGarage = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedGarage = await Garage.findByIdAndDelete(id);

    if (!deletedGarage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    res.status(200).json({ message: "Garage deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Get Garage ID by Email
const getGarageIdByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        message: "Email parameter is required",
      });
    }

    // Find garage by email
    const garage = await Garage.findOne({ email }).select("_id name email");

    if (!garage) {
      return res.status(404).json({
        message: "Garage not found with this email address",
      });
    }

    res.status(200).json({
      message: "Garage found successfully",
      data: {
        garageId: garage._id,
        name: garage.name,
        email: garage.email,
      },
    });
  } catch (error) {
    console.error("getGarageIdByEmail error:", error);
    res.status(500).json({
      message: "Failed to get garage ID",
      error: error.message,
    });
  }
};

module.exports = {
  createGarage,
  updateGarageLogo,
  garageLogin,
  garageLogout,
  renewGarageSubscription,
  getGarageById,
  getAllGarages,
  updateGarage,
  deleteGarage,
  getMe,
  submitRegistration,
  verifyRegistrationOTP,
  sendRegistrationOTP,
  getGarageIdByEmail,
  // Simple SMTP test endpoint
  async testEmailSend(req, res) {
    try {
      const to = req.query.to || process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
      if (!to) {
        return res.status(400).json({ message: "Provide ?to=email@example.com or set FROM_EMAIL/BREVO_SMTP_USER" });
      }
      const result = await sendEmail(to, "SMTP Test - Garage Management", "This is a test email from the server.");
      if (result && result.success) {
        return res.status(200).json({ message: "Email sent", to });
      }
      return res.status(502).json({ message: "Failed to send email", error: result && result.error ? result.error : "unknown" });
    } catch (err) {
      return res.status(500).json({ message: "Server Error", error: err.message });
    }
  }
};
