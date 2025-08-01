const Plan = require("../Model/plan.model");
const Garage = require("../Model/garage.model");
const razorpay = require("../Utils/razorpay");
const mongoose = require("mongoose");

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Create a plan
exports.createPlan = async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Get all plans
exports.getAllPlans = async (req, res) => {
  try {
    const plans = await Plan.find();
    res.status(200).json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get a single plan
exports.getPlanById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate plan ID
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid plan ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const plan = await Plan.findById(id);
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    res.status(200).json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update a plan
exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate plan ID
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid plan ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const plan = await Plan.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    res.status(200).json({ success: true, data: plan });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Delete a plan
exports.deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate plan ID
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid plan ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const plan = await Plan.findByIdAndDelete(id);
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Plan not found" });
    res
      .status(200)
      .json({ success: true, message: "Plan deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Renew subscription for existing garage
exports.renewSubscription = async (req, res) => {
  try {
    const { garageId, planId, paymentMethod = "razorpay" } = req.body;

    // Validate required fields
    if (!garageId || !planId) {
      return res.status(400).json({
        success: false,
        message: "garageId and planId are required",
      });
    }

    // Validate garageId
    if (!isValidObjectId(garageId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid garage ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Validate planId
    if (!isValidObjectId(planId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid plan ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Check Razorpay configuration
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("Razorpay environment variables not configured");
      return res.status(500).json({
        success: false,
        message: "Payment gateway configuration error",
        error: "Razorpay credentials not configured",
      });
    }

    // Validate garage
    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({
        success: false,
        message: "Garage not found",
      });
    }

    // Validate plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Validate plan amount
    if (!plan.amount || isNaN(plan.amount) || plan.amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan amount",
        error: "Plan amount must be a positive number",
      });
    }

    // Check if garage is already subscribed and not expired
    const currentDate = new Date();
    if (
      garage.isSubscribed &&
      garage.subscriptionEnd &&
      garage.subscriptionEnd > currentDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Garage already has an active subscription. Please wait until it expires.",
        currentSubscriptionEnd: garage.subscriptionEnd,
      });
    }

    // Create Razorpay order
    const orderOptions = {
      amount: plan.amount * 100, // Convert to paise
      currency: "INR",
      receipt: `renew_${Date.now()}`, // Shortened receipt format
      payment_capture: 1,
      notes: {
        garageId: garageId,
        planId: planId,
        planName: plan.name,
        durationInMonths: plan.durationInMonths,
      },
    };

    console.log("Creating Razorpay order with options:", orderOptions);

    const order = await razorpay.orders.create(orderOptions);

    console.log("Razorpay order created successfully:", order.id);

    res.status(200).json({
      success: true,
      message: "Order created for subscription renewal",
      order: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
      plan: {
        id: plan._id,
        name: plan.name,
        amount: plan.amount,
        durationInMonths: plan.durationInMonths,
        features: plan.features,
      },
      garage: {
        id: garage._id,
        name: garage.name,
        email: garage.email,
      },
    });
  } catch (error) {
    console.error("Renew subscription error:", error);

    // Provide more specific error messages
    let errorMessage = "Failed to create renewal order";
    if (error.message.includes("key_id")) {
      errorMessage = "Payment gateway configuration error";
    } else if (error.message.includes("amount")) {
      errorMessage = "Invalid plan amount";
    } else if (error.message.includes("currency")) {
      errorMessage = "Invalid currency configuration";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
  }
};

// Complete subscription renewal after payment
exports.completeRenewal = async (req, res) => {
  try {
    const {
      garageId,
      planId,
      orderId,
      paymentId,
      signature,
      paymentMethod = "razorpay",
    } = req.body;

    // Validate garageId
    if (!isValidObjectId(garageId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid garage ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Validate planId
    if (!isValidObjectId(planId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid plan ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Validate garage
    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({
        success: false,
        message: "Garage not found",
      });
    }

    // Validate plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Verify payment signature (for Razorpay)
    if (paymentMethod === "razorpay") {
      const text = `${orderId}|${paymentId}`;
      const crypto = require("crypto");
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(text)
        .digest("hex");

      if (signature !== expectedSignature) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment signature",
        });
      }
    }

    // Calculate subscription dates
    const currentDate = new Date();
    const endDate = new Date(currentDate);
    endDate.setMonth(endDate.getMonth() + plan.durationInMonths);

    // Update garage subscription
    const updatedGarage = await Garage.findByIdAndUpdate(
      garageId,
      {
        subscriptionType:
          plan.subscriptionType || `${plan.durationInMonths}_months`,
        subscriptionStart: currentDate,
        subscriptionEnd: endDate,
        isSubscribed: true,
        paymentDetails: {
          paymentId: paymentId,
          amount: plan.amount,
          method: paymentMethod,
          status: "paid",
          orderId: orderId,
          planId: planId,
        },
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Subscription renewed successfully",
      data: {
        garage: {
          id: updatedGarage._id,
          name: updatedGarage.name,
          subscriptionType: updatedGarage.subscriptionType,
          subscriptionStart: updatedGarage.subscriptionStart,
          subscriptionEnd: updatedGarage.subscriptionEnd,
          isSubscribed: updatedGarage.isSubscribed,
        },
        plan: {
          id: plan._id,
          name: plan.name,
          durationInMonths: plan.durationInMonths,
          amount: plan.amount,
        },
        payment: {
          paymentId: paymentId,
          orderId: orderId,
          method: paymentMethod,
          status: "paid",
        },
      },
    });
  } catch (error) {
    console.error("Complete renewal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete subscription renewal",
      error: error.message,
    });
  }
};

// Get subscription status for a garage
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const { garageId } = req.params;

    // Validate garageId
    if (!isValidObjectId(garageId)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid garage ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({
        success: false,
        message: "Garage not found",
      });
    }

    const currentDate = new Date();
    const isExpired =
      garage.subscriptionEnd && garage.subscriptionEnd < currentDate;
    const daysUntilExpiry = garage.subscriptionEnd
      ? Math.ceil(
          (garage.subscriptionEnd - currentDate) / (1000 * 60 * 60 * 24)
        )
      : null;

    res.status(200).json({
      success: true,
      data: {
        garageId: garage._id,
        garageName: garage.name,
        isSubscribed: garage.isSubscribed,
        subscriptionType: garage.subscriptionType,
        subscriptionStart: garage.subscriptionStart,
        subscriptionEnd: garage.subscriptionEnd,
        isExpired: isExpired,
        daysUntilExpiry: daysUntilExpiry,
        paymentDetails: garage.paymentDetails,
      },
    });
  } catch (error) {
    console.error("Get subscription status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get subscription status",
      error: error.message,
    });
  }
};
