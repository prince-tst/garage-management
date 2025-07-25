const Inventory = require("../Model/inventory.model");

// Add new part
const addPart = async (req, res) => {
  try {
    const {
      garageId,
      carName,
      model,
      partNumber,
      partName,
      quantity,
      purchasePrice,
      sellingPrice,
      taxAmount = 0,
      hsnNumber,
      igst = 0,
      cgstSgst = 0,
    } = req.body;

    if (
      !garageId ||
      !carName ||
      !model ||
      !partNumber ||
      !partName ||
      !quantity ||
      !purchasePrice ||
      !sellingPrice ||
      !hsnNumber
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const part = new Inventory({
      garageId,
      carName,
      model,
      partNumber,
      partName,
      quantity,
      purchasePrice,
      sellingPrice,
      taxAmount,
      hsnNumber,
      igst,
      cgstSgst,
    });
    const savedPart = await part.save();
    res
      .status(201)
      .json({ message: "Part added successfully", data: savedPart });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add part", error: error.message });
  }
};

// Get all parts for a garage
const getPartsByGarage = async (req, res) => {
  try {
    const { garageId } = req.params;
    const parts = await Inventory.find({ garageId });
    res.status(200).json(parts);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving parts", error: error.message });
  }
};

// Update part
const updatePart = async (req, res) => {
  try {
    const { partId } = req.params;
    const {
      carName,
      model,
      partNumber,
      partName,
      quantity,
      purchasePrice,
      sellingPrice,
      taxAmount = 0,
      hsnNumber,
      igst = 0,
      cgstSgst = 0,
    } = req.body;

    const updateFields = {
      carName,
      model,
      partNumber,
      partName,
      quantity,
      purchasePrice,
      sellingPrice,
      taxAmount,
      hsnNumber,
      igst,
      cgstSgst,
    };
    const updated = await Inventory.findByIdAndUpdate(partId, updateFields, {
      new: true,
    });
    res
      .status(200)
      .json({ message: "Part updated successfully", data: updated });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update part", error: error.message });
  }
};

// Delete part (optional)
const deletePart = async (req, res) => {
  try {
    const { partId } = req.params;
    await Inventory.findByIdAndDelete(partId);
    res.status(200).json({ message: "Part deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete part", error: error.message });
  }
};

module.exports = { addPart, deletePart, updatePart, getPartsByGarage };
