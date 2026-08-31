require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pool = require("./db");
const authRoutes = require("./routes/auth");

const app = express();

const PORT = process.env.PORT || 5000;

/*
  CORS
*/
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*"
  })
);

/*
  Parse JSON request bodies
*/
app.use(express.json());

/*
  REQUEST LOGGER
  This helps us see every request reaching Render.
*/
app.use((req, res, next) => {
  console.log(
    `[REQUEST] ${req.method} ${req.originalUrl}`
  );

  next();
});

/*
  Basic API test
*/
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Kenbridge Christian School API is running."
  });
});

/*
  Server health test
*/
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    service: "Kenbridge Backend"
  });
});

/*
  Database connection test
*/
app.get("/api/health/database", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time"
    );

    res.json({
      success: true,
      database: "connected",
      time: result.rows[0].current_time
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      success: false,
      database: "disconnected"
    });
  }
});

/*
  Authentication routes
*/
app.use("/api/auth", authRoutes);

/*
  404 handler
  This will show if Postman is using
  the wrong URL.
*/
app.use((req, res) => {
  console.log(
    `[404 NOT FOUND] ${req.method} ${req.originalUrl}`
  );

  res.status(404).json({
    success: false,
    message: "API endpoint not found.",
    path: req.originalUrl
  });
});

/*
  Start server
*/
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Kenbridge backend running on port ${PORT}`
  );
});
