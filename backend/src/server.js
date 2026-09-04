require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db");

const dashboardRoutes = require("./routes/dashboard");
const authRoutes = require("./routes/auth");
const contentRoutes = require("./routes/content");
const payrollRoutes = require("./routes/payroll");
const staffNotificationsRoutes = require("./routes/staff-notifications");
const leaveRoutes = require("./routes/leave");
const staffResourcesRoutes = require("./routes/staff-resources");
const staffContentRoutes = require("./routes/staff-content");
const tasksRoutes = require("./routes/tasks");
const messagesRoutes = require("./routes/messages");
const adminNotificationsRoutes = require("./routes/admin-notifications");
const reportsRoutes = require("./routes/reports");
const galleryRoutes = require("./routes/gallery");
const studentsRoutes = require("./routes/students");
const documentsRoutes = require("./routes/documents");
const calendarRoutes = require("./routes/calendar");
const attendanceRoutes = require("./routes/attendance");
const staffRoutes = require("./routes/staff");
const publicContentRoutes = require("./routes/public-content");

// New submissions workflow
const submissionsRoutes = require("./routes/submissions");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    limit: "2mb",
  })
);

app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Kenbridge Christian School API is running.",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    service: "Kenbridge Backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health/database", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    res.status(200).json({
      success: true,
      database: "connected",
      time: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("DATABASE CONNECTION ERROR:", error.message);

    res.status(500).json({
      success: false,
      database: "disconnected",
      message: "Database connection failed.",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/staff-content", staffContentRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/public", publicContentRoutes);
app.use("/api/resources", staffResourcesRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/notifications", staffNotificationsRoutes);
app.use("/api/admin/notifications", adminNotificationsRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/gallery", galleryRoutes);

// Report submissions workflow
app.use("/api/submissions", submissionsRoutes);

app.use((req, res) => {
  console.log(`[404 NOT FOUND] ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
    path: req.originalUrl,
  });
});

app.use((error, req, res, next) => {
  console.error("GLOBAL SERVER ERROR:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred.",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Kenbridge backend running on port ${PORT}`);
});
