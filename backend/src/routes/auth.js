const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();


/*
  TEMPORARY INITIAL ADMIN SETUP

  Requires:
  x-setup-secret: SETUP_SECRET
*/

router.post("/setup-admin", async (req, res) => {
  try {
    const setupSecret = req.headers["x-setup-secret"];

    if (!setupSecret || setupSecret !== process.env.SETUP_SECRET) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized setup request."
      });
    }

    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email and password are required."
      });
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    const user = data.user;

    try {
      await pool.query(
  `INSERT INTO users
   (id, full_name, email, role, password_hash, is_active)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [user.id, full_name, email, "ADMIN", null, true]
);
    } catch (databaseError) {
      /*
        If the profile creation fails, remove the Auth user
        so we don't leave an incomplete account behind.
      */
      await supabase.auth.admin.deleteUser(user.id);

      throw databaseError;
    }

    return res.status(201).json({
      success: true,
      message: "Administrator account created successfully.",
      user: {
        id: user.id,
        full_name,
        email,
        role: "ADMIN"
      }
    });

  } catch (error) {
    console.error("Admin setup error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create administrator account."
    });
  }
});


/*
  POST /api/auth/login
*/

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: {
        id: data.user.id,
        email: data.user.email
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during login."
    });
  }
});


/*
  GET /api/auth/me
*/

router.get("/me", async (req, res) => {
  try {
    const authorization = req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required."
      });
    }

    const token = authorization.replace("Bearer ", "");

    const { data, error } =
      await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token."
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });

  } catch (error) {
    console.error("Authentication error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed."
    });
  }
});


module.exports = router;
