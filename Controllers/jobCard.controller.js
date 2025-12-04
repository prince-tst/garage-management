const JobCard = require("../Model/jobCard.model");
const Garage = require("../Model/garage.model");
const Engineer = require("../Model/engineer.model");
const mongoose = require("mongoose");

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Helper function to get next job card number atomically
const generateNextJobCardNumber = async (garageId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the last job card for this garage
    const lastJobCard = await JobCard.findOne({ garageId })
      .sort({ jobCardNumber: -1 })
      .select("jobCardNumber")
      .session(session);

    let nextNumber = 1;
    if (
      lastJobCard &&
      lastJobCard.jobCardNumber &&
      !isNaN(lastJobCard.jobCardNumber)
    ) {
      nextNumber = lastJobCard.jobCardNumber + 1;
    }

    await session.commitTransaction();
    return nextNumber;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Helper function to validate and process parts with tax and HSN information
const validateAndProcessParts = (parts) => {
  if (!Array.isArray(parts)) {
    throw new Error("Parts must be an array");
  }

  return parts.map(part => {
    // Validate required fields
    if (!part.partName || !part.quantity || !part.pricePerPiece) {
      throw new Error("Part must have partName, quantity, and pricePerPiece");
    }

    // Calculate total price if not provided
    const totalPrice = part.totalPrice || (part.quantity * part.pricePerPiece);
    
    // Handle different tax field names (taxAmount, taxPercentage)
    let taxAmount = 0;
    if (part.taxAmount !== undefined) {
      taxAmount = part.taxAmount;
    } else if (part.taxPercentage !== undefined) {
      // Convert percentage to amount if needed
      taxAmount = (totalPrice * part.taxPercentage) / 100;
    }
    
    // Handle HSN number
    const hsnNumber = part.hsnNumber || part.hsnCode || "";

    return {
      partName: part.partName,
      quantity: Number(part.quantity),
      pricePerPiece: Number(part.pricePerPiece),
      totalPrice: Number(totalPrice),
      taxAmount: Number(taxAmount),
      hsnNumber: String(hsnNumber),
      // Additional fields
      taxPercentage: Number(part.taxPercentage || 0),
      igst: Number(part.igst || 0),
      cgstSgst: Number(part.cgstSgst || 0),
      partNumber: String(part.partNumber || ""),
    };
  });
};

// Helper function to validate and process LabourServiceCost
const validateAndProcessLabourServiceCost = (labourServiceCost) => {
  if (!Array.isArray(labourServiceCost)) {
    throw new Error("LabourServiceCost must be an array");
  }

  return labourServiceCost.map((item) => {
    // Validate required fields
    if (item.LabourCost === undefined || item.LabourType === undefined) {
      throw new Error("LabourServiceCost item must have LabourCost and LabourType");
    }

    const processedItem = {
      LabourCost: Number(item.LabourCost),
      LabourTax: Number(item.LabourTax || 0),
      LabourType: String(item.LabourType),
      LabourNotes: String(item.LabourNotes || ""),
    };

    // If LabourType is "parts", validate and process parts array
    if (item.LabourType === "parts" || item.LabourType.toLowerCase() === "parts") {
      if (!item.parts || !Array.isArray(item.parts)) {
        throw new Error("When LabourType is 'parts', a parts array is required");
      }
      processedItem.parts = validateAndProcessParts(item.parts);
    } else {
      // If not parts, set empty array or omit
      processedItem.parts = [];
    }

    return processedItem;
  });
};

// ➤ Create a Job Card (Engineer not assigned initially)
// const createJobCard = async (req, res) => {
//   try {
//     const { garageId, customerNumber, customerName, contactNumber, email, company, carNumber, model, kilometer, fuelType, insuranceProvider, policyNumber, expiryDate, registrationNumber, type, excessAmount, jobDetails, images, video } = req.body;

//     // Check if garage exists
//     const garage = await Garage.findById(garageId);
//     if (!garage) {
//       return res.status(404).json({ message: "Garage not found" });
//     }

//     const newJobCard = new JobCard({
//       garageId,
//       customerNumber,
//       customerName,
//       contactNumber,
//       email,
//       company,
//       carNumber,
//       model,
//       kilometer,
//       fuelType,
//       insuranceProvider,
//       policyNumber,
//       expiryDate,
//       registrationNumber,
//       type,
//       excessAmount,
//       jobDetails,
//       images,
//       video,
//       status: "In Progress",  // Default status
//       engineerId: null  // Engineer will be assigned later
//     });

//     await newJobCard.save();
//     res.status(201).json({ message: "Job Card created successfully", jobCard: newJobCard });
//   } catch (error) {
//     res.status(500).json({ message: "Server Error", error: error.message });
//   }
// };

const createJobCard = async (req, res) => {
  try {
    const {
      garageId,
      customerNumber,
      customerName,
      contactNumber,
      email,
      company,
      carNumber,
      model,
      kilometer,
      fuelType,
      fuelLevel, // Added fuel level
      insuranceProvider,
      policyNumber,
      expiryDate,
      registrationNumber,
      type, // jobType
      excessAmount, // Excess amount for insurance claims
      laborServicesTotal, // Labor & Services Total
      laborServicesTax, // Labor & Services Tax
      jobDetails, // price removed from here
      LabourServiceCost, // New field for labor service costs
    } = req.body;

    const images = req.files?.images?.map((file) => file.path) || [];
    const video = req.files?.video?.[0]?.path || null;

    // Validate garageId
    if (!isValidObjectId(garageId)) {
      return res.status(400).json({ message: "Invalid garage ID format" });
    }

    // Check if req.garage exists (from hybrid authentication)
    if (!req.garage || !req.garage._id) {
      return res.status(401).json({
        message:
          "Authentication required. Please provide a valid user or garage JWT token.",
      });
    }

    // Verify that the authenticated garage matches the garageId in request
    if (req.garage._id.toString() !== garageId) {
      return res.status(403).json({
        message: "You can only create job cards for your own garage.",
      });
    }

    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    // Generate sequential job card number for this garage atomically
    const jobCardNumber = await generateNextJobCardNumber(garageId);

    // Generate jobId (e.g., JC-<timestamp>)
    const jobId = `JC-${Date.now()}`;

    // Store user information in createdBy if available, otherwise use garage info
    let createdBy = req.garage._id; // Default to garage ID
    let createdByModel = "Garage"; // Default to garage

    // If we have user information in the request, use that instead
    if (req.user && req.user._id) {
      createdBy = req.user._id;
      createdByModel = "User";
    }

    // Validate that jobCardNumber is a valid number
    if (!jobCardNumber || isNaN(jobCardNumber) || jobCardNumber < 1) {
      throw new Error("Invalid job card number generated");
    }

    // Validate and process LabourServiceCost if provided
    let processedLabourServiceCost = [];
    if (LabourServiceCost) {
      try {
        processedLabourServiceCost = validateAndProcessLabourServiceCost(LabourServiceCost);
      } catch (error) {
        return res.status(400).json({
          message: "Invalid LabourServiceCost data",
          error: error.message,
        });
      }
    }

    const newJobCard = new JobCard({
      garageId,
      customerNumber,
      customerName,
      contactNumber,
      email,
      company,
      carNumber,
      model,
      kilometer,
      fuelType,
      fuelLevel, // Added
      insuranceProvider,
      policyNumber,
      expiryDate,
      registrationNumber,
      type, // jobType
      excessAmount, // Excess amount for insurance claims
      laborServicesTotal, // Labor & Services Total
      laborServicesTax, // Labor & Services Tax
      jobDetails, // price removed
      LabourServiceCost: processedLabourServiceCost, // Processed labor service costs
      images, // These are Cloudinary URLs
      video, // Also Cloudinary URL
      status: "In Progress",
      engineerId: null,
      jobId, // Added jobId
      jobCardNumber, // Sequential number per garage
      createdBy, // Track creator (user ID or garage ID)
      createdByModel, // Track whether creator is user or garage
    });

    await newJobCard.save();

    // Populate creator info for response
    const populatedJobCard = await JobCard.findById(newJobCard._id).populate({
      path: "createdBy",
      select: "name email role",
    });

    res.status(201).json({
      message: "Job Card created successfully",
      jobCard: populatedJobCard,
    });
  } catch (error) {
    console.error("createJobCard error:", error);

    // Handle specific validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        message: "Validation Error",
        errors: validationErrors,
      });
    }

    // Handle job card number generation errors
    if (error.message === "Invalid job card number generated") {
      return res.status(500).json({
        message: "Failed to generate job card number. Please try again.",
      });
    }

    // Handle duplicate job card number errors
    if (
      error.code === 11000 &&
      error.keyPattern &&
      error.keyPattern.jobCardNumber
    ) {
      return res.status(409).json({
        message: "Job card number already exists. Please try again.",
      });
    }

    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
const updateGenerateBillStatus = async (req, res) => {
  try {
    const { jobCardId } = req.params;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({ message: "Invalid job card ID format" });
    }

    // Check if req.garage exists (from garage authentication)
    if (!req.garage || !req.garage._id) {
      return res.status(401).json({
        message:
          "Authentication required. Please provide a valid garage JWT token.",
      });
    }

    // Find job card, ensuring it belongs to the authenticated garage
    const jobCard = await JobCard.findOne({
      _id: jobCardId,
      garageId: req.garage._id,
    });
    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    jobCard.generateBill = true;
    await jobCard.save();

    // Populate creator info for response
    const populatedJobCard = await JobCard.findById(jobCard._id).populate({
      path: "createdBy",
      select: "name email role",
    });

    // Attach latest invoice number from Bill model
    let formattedInvoiceNo = null;
    try {
      const Bill = require("../Model/bill.model");
      const latestBill = await Bill.findOne({ jobCardId: jobCard._id })
        .sort({ createdAt: -1 })
        .select("invoiceNo");
      if (latestBill && latestBill.invoiceNo) {
        const digits = String(latestBill.invoiceNo).replace(/[^\d]/g, "");
        formattedInvoiceNo = `INV-${digits.padStart(3, "0")}`;
      }
    } catch (e) {
      // ignore invoice lookup errors
    }

    res.status(200).json({
      message: "Job Card bill status updated to true",
      jobCard: {
        ...populatedJobCard.toObject(),
        invoiceNo: formattedInvoiceNo,
      },
    });
  } catch (error) {
    console.error("Error updating bill status:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// ➤ Get All Job Cards (For a Specific Garage)
const getJobCardsByGarage = async (req, res) => {
  try {
    const { garageId } = req.params;
    const { createdBy } = req.query; // Get user filter from query params

    // Validate garageId
    if (!isValidObjectId(garageId)) {
      return res.status(400).json({
        message:
          "Invalid garage ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    // Build filter based on user type
    const filter = { garageId };

    // If createdBy is provided, filter by user who created the job card
    if (createdBy && isValidObjectId(createdBy)) {
      filter.createdBy = createdBy;
    }

    // Fetch job cards
    const jobCards = await JobCard.find(filter)
      .populate("engineerId", "name")
      .populate({
        path: "createdBy",
        select: "name email role",
      });

    // Include invoiceNo from Bill model (latest bill per job card)
    const jobCardIds = jobCards.map((jc) => jc._id);
    const Bill = require("../Model/bill.model");
    const bills = await Bill.find({ jobCardId: { $in: jobCardIds } })
      .sort({ createdAt: -1 })
      .select("jobCardId invoiceNo createdAt");

    const latestInvoiceByJobCard = new Map();
    for (const b of bills) {
      const key = String(b.jobCardId);
      if (!latestInvoiceByJobCard.has(key)) {
        latestInvoiceByJobCard.set(key, b.invoiceNo);
      }
    }

    const result = jobCards.map((jc) => {
      const rawInvoice = latestInvoiceByJobCard.get(String(jc._id));
      const formattedInvoice = rawInvoice
        ? `INV-${String(rawInvoice).replace(/[^\d]/g, "").padStart(3, "0")}`
        : null;
      return {
        ...jc.toObject(),
        invoiceNo: formattedInvoice,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("getJobCardsByGarage error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ➤ Get a Single Job Card by ID
const getJobCardById = async (req, res) => {
  try {
    const { jobCardId } = req.params;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Find job card
    const jobCard = await JobCard.findById(jobCardId)
      .populate("engineerId", "name")
      .populate({
        path: "createdBy",
        select: "name email role",
      }); // Populate creator info

    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    // Attach latest invoice number from Bill model
    let formattedInvoiceNo = null;
    try {
      const Bill = require("../Model/bill.model");
      const latestBill = await Bill.findOne({ jobCardId: jobCard._id })
        .sort({ createdAt: -1 })
        .select("invoiceNo");
      if (latestBill && latestBill.invoiceNo) {
        const digits = String(latestBill.invoiceNo).replace(/[^\d]/g, "");
        formattedInvoiceNo = `INV-${digits.padStart(3, "0")}`;
      }
    } catch (e) {
      // ignore invoice lookup errors
    }

    res.status(200).json({
      ...jobCard.toObject(),
      invoiceNo: formattedInvoiceNo,
    });
  } catch (error) {
    console.error("getJobCardById error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ➤ Update Job Card Details
const updateJobCard = async (req, res) => {
  try {
    const { jobCardId } = req.params;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const updates = req.body;

    // Define allowed fields for update
    const allowedFields = [
      "customerNumber",
      "customerName",
      "contactNumber",
      "email",
      "company",
      "carNumber",
      "model",
      "kilometer",
      "fuelType",
      "fuelLevel",
      "insuranceProvider",
      "policyNumber",
      "expiryDate",
      "registrationNumber",
      "type",
      "excessAmount",
      "laborServicesTotal",
      "laborServicesTax",
      "jobDetails",
      "images",
      "video",
      "status",
      "engineerId",
      "gstApplicable",
      "LabourServiceCost"
    ];
    const filteredUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        // Special handling for LabourServiceCost
        if (key === "LabourServiceCost") {
          try {
            filteredUpdates[key] = validateAndProcessLabourServiceCost(updates[key]);
          } catch (error) {
            return res.status(400).json({
              message: "Invalid LabourServiceCost data",
              error: error.message,
            });
          }
        } else {
          filteredUpdates[key] = updates[key];
        }
      }
    }

    // Find and update job card
    const jobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      filteredUpdates,
      { new: true }
    );

    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    res.status(200).json({ message: "Job Card updated successfully", jobCard });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ➤ Delete a Job Card
const deleteJobCard = async (req, res) => {
  try {
    const { jobCardId } = req.params;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Find and delete job card
    const jobCard = await JobCard.findByIdAndDelete(jobCardId);

    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    res.status(200).json({ message: "Job Card deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ➤ Assign an Engineer to a Job Card
const assignEngineer = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const { engineerId } = req.body;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Validate input
    if (!Array.isArray(engineerId) || engineerId.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide an array of engineerIds" });
    }

    // Validate each engineerId
    for (const id of engineerId) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message: `Invalid engineer ID format: ${id}. Please provide a valid 24-character ObjectId.`,
        });
      }
    }

    // Find Job Card, ensuring it belongs to the authenticated garage
    const jobCard = await JobCard.findOne({
      _id: jobCardId,
      garageId: req.garage._id,
    });
    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    // Validate Engineers and garage match
    const engineers = await Engineer.find({
      _id: { $in: engineerId },
    });

    if (engineers.length !== engineerId.length) {
      return res.status(403).json({ message: "Some engineers are invalid" });
    }

    // Assign Engineers
    jobCard.engineerId = engineerId;
    await jobCard.save();

    res.status(200).json({
      message: "Engineers assigned successfully",
      jobCard,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const assignJobCardsToEngineer = async (req, res) => {
  try {
    const { engineerId } = req.params;
    const { jobCardIds } = req.body;

    // Validate engineerId
    if (!isValidObjectId(engineerId)) {
      return res.status(400).json({
        message:
          "Invalid engineer ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    if (!Array.isArray(jobCardIds) || jobCardIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Provide an array of jobCardIds" });
    }

    // Validate each jobCardId
    for (const id of jobCardIds) {
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          message: `Invalid job card ID format: ${id}. Please provide a valid 24-character ObjectId.`,
        });
      }
    }

    const engineer = await Engineer.findById(engineerId);
    if (!engineer) {
      return res.status(404).json({ message: "Engineer not found" });
    }

    // Update JobCards to include this engineer
    await JobCard.updateMany(
      { _id: { $in: jobCardIds } },
      { $set: { engineerId: engineerId } }
    );

    // Optional: Update Engineer to include jobCards (if using assignedJobCards field)
    await Engineer.findByIdAndUpdate(engineerId, {
      $addToSet: { assignedJobCards: { $each: jobCardIds } },
    });

    res.status(200).json({ message: "Job Cards assigned to engineer" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
// ➤ Update Job Status (In Progress, Completed, Pending, Cancelled)
const updateJobStatus = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const { status } = req.body;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Find job card, ensuring it belongs to the authenticated garage
    const jobCard = await JobCard.findOne({
      _id: jobCardId,
      garageId: req.garage._id,
    });
    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    jobCard.status = status;
    await jobCard.save();

    res
      .status(200)
      .json({ message: "Job status updated successfully", jobCard });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const logWorkProgress = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const { partsUsed, laborHours, engineerRemarks, status } = req.body;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Find job card
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard)
      return res.status(404).json({ message: "Job Card not found" });

    if (partsUsed) {
      try {
        jobCard.partsUsed = validateAndProcessParts(partsUsed);
      } catch (err) {
        return res.status(400).json({ message: "Invalid parts data", error: err.message });
      }
    }
    if (laborHours) jobCard.laborHours = laborHours;
    if (engineerRemarks) jobCard.engineerRemarks = engineerRemarks;
    if (
      status &&
      ["In Progress", "Completed", "Pending", "Cancelled"].includes(status)
    ) {
      jobCard.status = status;
    }

    await jobCard.save();
    res.status(200).json({ message: "Work progress updated", jobCard });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const qualityCheckByEngineer = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const { notes } = req.body;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message:
          "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Find job card
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard)
      return res.status(404).json({ message: "Job Card not found" });

    if (!jobCard.engineerId) {
      return res
        .status(400)
        .json({ message: "No engineer assigned to perform quality check" });
    }

    if (jobCard.qualityCheck && jobCard.qualityCheck.doneBy) {
      return res
        .status(409)
        .json({ message: "Quality Check already completed" });
    }

    jobCard.qualityCheck = {
      doneBy: jobCard.engineerId,
      notes: notes || "No remarks",
      date: new Date(),
      billApproved: true,
    };

    await jobCard.save();
    res.status(200).json({ message: "Quality check completed", jobCard });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// ➤ Add Parts to Job Card
const addPartsToJobCard = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const { parts } = req.body;

    // Validate jobCardId
    if (!isValidObjectId(jobCardId)) {
      return res.status(400).json({
        message: "Invalid job card ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    // Find job card
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    if (!parts || !Array.isArray(parts)) {
      return res.status(400).json({ message: "Parts must be an array" });
    }

    try {
      const validatedParts = validateAndProcessParts(parts);
      
      // Add new parts to existing parts
      if (jobCard.partsUsed) {
        jobCard.partsUsed.push(...validatedParts);
      } else {
        jobCard.partsUsed = validatedParts;
      }

      await jobCard.save();
      
      res.status(200).json({ 
        message: "Parts added successfully", 
        jobCard,
        addedParts: validatedParts 
      });
    } catch (err) {
      return res.status(400).json({ message: "Invalid parts data", error: err.message });
    }

  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// ➤ Get Next Job Card Number for a Garage
const getNextJobCardNumber = async (req, res) => {
  try {
    const { garageId } = req.params;

    // Validate garageId
    if (!isValidObjectId(garageId)) {
      return res.status(400).json({
        message:
          "Invalid garage ID format. Please provide a valid 24-character ObjectId.",
      });
    }

    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    // Get the highest job card number for this garage
    const lastJobCard = await JobCard.findOne({ garageId })
      .sort({ jobCardNumber: -1 })
      .select("jobCardNumber");

    // Ensure nextJobCardNumber is always a valid number
    let nextJobCardNumber = 1; // Default to 1 if no previous job cards exist

    if (
      lastJobCard &&
      lastJobCard.jobCardNumber &&
      !isNaN(lastJobCard.jobCardNumber)
    ) {
      nextJobCardNumber = lastJobCard.jobCardNumber + 1;
    }

    res.status(200).json({
      garageId,
      nextJobCardNumber,
      message: `Next job card number for garage ${garage.name}`,
    });
  } catch (error) {
    console.error("getNextJobCardNumber error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

module.exports = {
  createJobCard,
  updateGenerateBillStatus,
  getJobCardsByGarage,
  getJobCardById,
  updateJobCard,
  deleteJobCard,
  assignEngineer,
  assignJobCardsToEngineer,
  updateJobStatus,
  logWorkProgress,
  qualityCheckByEngineer,
  addPartsToJobCard, // Add the new function
  getNextJobCardNumber, // Add the new function
};
