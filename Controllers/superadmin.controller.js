const User = require("../Model/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// CREATE user with permissions
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;

    if (!["admin", "manager", "staff"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      permissions,
      garageId: req.garage,
    });

    res.status(201).json({ message: "User created", user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
exports.userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    res.json({
      message: "log in successfully",
      token,
      user,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
exports.getUserPermissions = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.permissions) {
      return res.status(403).json({ message: "Permissions not available." });
    }

    return res.status(200).json({
      userId: user._id,
      role: user.role,
      permissions: user.permissions,
    });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    return res.status(500).json({ message: "Server error." });
  }
};
// UPDATE user permissions
exports.updatePermissions = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.permissions = req.body.permissions || [];
    await user.save();

    res.json({ message: "Permissions updated", user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET all non-super-admin users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "super-admin" } });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    // console.log(req.garage.id);
    const users = await User.find({ garageId: req.garage.id });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
