const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Garage = require("../Model/garage.model");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();
// const razorpay = require("../utils/razorpay");

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
};
