const express = require("express");
const cors = require("cors");
const app = express();
const connection = require("./Config/db");
const reminderRoutes = require("./Routes/reminder.routes");
const cleanupExpiredRegistrations = require("./Utils/cleanupExpiredRegistrations");
// const superadminRoutes = require("./Routes/superadmin.routes");
const garageRoutes = require("./Routes/garage.routes");
const engineerRoutes = require("./Routes/engineer.routes");
const jobRoutes = require("./Routes/jobCard.routes");
const inventoryRoutes = require("./Routes/inventory.routes");
const adminRoutes = require("./Routes/admin.routes");
const verificationRoutes = require("./Routes/verify.routes");
const planRoutes = require("./Routes/plan.routes");

// Configure CORS with explicit origins
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://garage-management-zi5z.onrender.com",
    "https://qarage-management-zi5z.onrender.com", // Handle the typo in URL
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
};

// app.use(cors(corsOptions));
app.use(cors());
app.use(express.json());

app.use("/api/garage", garageRoutes);
app.use("/api/engineers", engineerRoutes);
app.use("/api/jobcards", jobRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/verify", verificationRoutes);
app.use("/api/plans", planRoutes);
// app.use("/api/history", historyRoutes);
app.use("/api/billing", require("./Routes/billing.routes"));
app.use("/api/reminders", reminderRoutes);
// app.use("/api/superadmin", superadminRoutes);
app.use("/uploads", express.static("uploads")); // So you can access files (images) via URL

const PORT = 8000;

app.get("/", (req, res) => {
  res.status(200).send("Home Page");
});

const startServer = async () => {
  try {
    await connection(); // Ensure DB is connected first

    // Set up cleanup job to run every hour
    setInterval(cleanupExpiredRegistrations, 60 * 60 * 1000); // Run every hour

    app.listen(PORT, () => {
      console.log("Welcome to server");
    });
  } catch (err) {
    console.error("DB connection failed:", err);
    process.exit(1); // Exit the app if DB is dead
  }
};

startServer();
