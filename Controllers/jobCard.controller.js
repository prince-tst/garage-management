const JobCard = require("../Model/jobCard.model");
const Garage = require("../Model/garage.model");
const Engineer = require("../Model/engineer.model");

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
      jobDetails, // price removed from here
      // excessAmount removed as required
    } = req.body;

    const images = req.files?.images?.map((file) => file.path) || [];
    const video = req.files?.video?.[0]?.path || null;

    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({ message: "Garage not found" });
    }

    // Generate jobId (e.g., JC-<timestamp>)
    const jobId = `JC-${Date.now()}`;
    const createdBy = req.user ? req.user._id : null;

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
      jobDetails, // price removed
      images, // These are Cloudinary URLs
      video, // Also Cloudinary URL
      status: "In Progress",
      engineerId: null,
      jobId, // Added jobId
      createdBy, // Track creator
    });

    await newJobCard.save();

    res.status(201).json({
      message: "Job Card created successfully",
      jobCard: newJobCard,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
const updateGenerateBillStatus = async (req, res) => {
  try {
    const { jobCardId } = req.params;

    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    jobCard.generateBill = true;
    await jobCard.save();

    res.status(200).json({
      message: "Job Card bill status updated to true",
      jobCard,
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

    // Check if garage exists
    const garage = await Garage.findById(garageId);
    if (!garage) {
      return res.status(404).json({ message: "Garage not found , test two" });
    }
    let filter = { garageId };
    if (
      req.user &&
      req.user.role !== "admin" &&
      req.user.role !== "super-admin"
    ) {
      filter.createdBy = req.user._id;
    }

    const jobCards = await JobCard.find(filter).populate("engineerId", "name");
    res.status(200).json(jobCards);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ➤ Get a Single Job Card by ID
const getJobCardById = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    let filter = { _id: jobCardId };
    if (
      req.user &&
      req.user.role !== "admin" &&
      req.user.role !== "super-admin"
    ) {
      filter.createdBy = req.user._id;
    }
    const jobCard = await JobCard.findOne(filter).populate(
      "engineerId",
      "name"
    );

    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    res.status(200).json(jobCard);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// ➤ Update Job Card Details
const updateJobCard = async (req, res) => {
  try {
    const { jobCardId } = req.params;
    const updates = req.body; // Fields to update

    // Only allow updating allowed fields
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
      "jobDetails",
      "images",
      "video",
      "status",
      "engineerId",
    ];
    const filteredUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) filteredUpdates[key] = updates[key];
    }

    const jobCard = await JobCard.findByIdAndUpdate(
      jobCardId,
      filteredUpdates,
      {
        new: true,
      }
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

    // Validate input
    if (!Array.isArray(engineerId) || engineerId.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide an array of engineerIds" });
    }

    // Find Job Card
    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard) {
      return res.status(404).json({ message: "Job Card not found" });
    }

    // Validate Engineers and garage match
    const engineers = await Engineer.find({
      _id: { $in: engineerId },
      garageId: jobCard.garageId,
    });

    if (engineers.length !== engineerId.length) {
      return res
        .status(403)
        .json({ message: "Some engineers are invalid or not in this garage" });
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

    if (!Array.isArray(jobCardIds) || jobCardIds.length === 0) {
      return res
        .status(400)
        .json({ message: "Provide an array of jobCardIds" });
    }

    const engineer = await Engineer.findById(engineerId);
    if (!engineer) {
      return res.status(404).json({ message: "Engineer not found" });
    }

    // Update JobCards to include this engineer
    await JobCard.updateMany(
      { _id: { $in: jobCardIds } },
      { $set: { engineerId: engineerId } } // Prevent duplicates
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

    const jobCard = await JobCard.findById(jobCardId);
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

    const jobCard = await JobCard.findById(jobCardId);
    if (!jobCard)
      return res.status(404).json({ message: "Job Card not found" });

    if (partsUsed) jobCard.partsUsed = partsUsed;
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
    res.status(200).json({ message: "Quality Check completed", jobCard });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
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
};
