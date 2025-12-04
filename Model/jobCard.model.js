const mongoose = require("mongoose");

const JobCardSchema = new mongoose.Schema(
  {
    garageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Garage",
      required: true,
    },
    engineerId: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Engineer", default: null },
    ], // Engineer is assigned later
    customerNumber: { type: String, required: true },
    customerName: { type: String, required: true },
    contactNumber: { type: String, required: true },
    email: { type: String },
    company: { type: String },
    carNumber: { type: String, required: true },
    model: { type: String, required: true },
    kilometer: { type: Number, required: true },
    fuelType: { type: String, required: true },
    fuelLevel: { type: String }, // Added fuel level
    insuranceProvider: { type: String },
    invoiceNo: { type: String },
    gstApplicable: { type: Boolean, default: false },
    policyNumber: { type: String },
    expiryDate: { type: Date },
    registrationNumber: { type: String },
    type: { type: String }, // jobType
    excessAmount: { type: Number, default: 0 }, // Excess amount for insurance claims
    jobDetails: { type: String }, // price removed from here
    status: {
      type: String,
      enum: ["In Progress", "Completed", "Pending", "Cancelled"],
      // default: "In Progress", // Default job status
    },
    // Add jobId for PDF and details
    jobId: { type: String },
    // Add sequential job card number per garage
    jobCardNumber: { type: Number, required: true },
    // Track which employee created this jobcard
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "createdByModel",
    },
    createdByModel: {
      type: String,
      enum: ["User", "Garage"],
      default: "User",
    },
    generateBill: { type: Boolean, default: false },
    images: [{ type: String }],
    video: { type: String },
    partsUsed: [
      {
        partName: String,
        quantity: Number,
        pricePerPiece: Number,
        totalPrice: Number,
        taxAmount: Number,
        hsnNumber: String,
        // Additional tax fields for flexibility
        taxPercentage: Number,
        igst: Number,
        cgstSgst: Number,
        partNumber: String,
      },
    ],
    laborHours: Number,
    laborServicesTotal: { type: Number, default: 0 }, // Labor & Services Total
    laborServicesTax: { type: Number, default: 0 }, // Labor & Services Tax
    labourServiceCost: [
      {
        LabourCost: { type: Number, required: true },
        LabourTax: { type: Number, default: 0 },
        LabourType: { type: String, required: true },
        LabourNotes: { type: String, default: "" },
        parts: [
          {
            partName: String,
            quantity: Number,
            pricePerPiece: Number,
            totalPrice: Number,
            taxAmount: Number,
            hsnNumber: String,
            taxPercentage: Number,
            igst: Number,
            cgstSgst: Number,
            partNumber: String,
          },
        ],
      },
    ],
    engineerRemarks: String,
    qualityCheck: {
      notes: String,
      date: Date,
      doneBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Engineer", // Assuming engineers do QC
      },
      billApproved: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

// Add compound unique index to prevent duplicate job card numbers within the same garage
JobCardSchema.index({ garageId: 1, jobCardNumber: 1 }, { unique: true });

const JobCard = mongoose.model("JobCard", JobCardSchema);
module.exports = JobCard;
