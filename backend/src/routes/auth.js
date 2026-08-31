const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

/*
  TEMPORARY INITIAL ADMIN SETUP
  POST /api/auth/setup-admin
*/

router.post("/setup-admin", async (req, res) => {
  try {
    const setupSecret = req.headers["x-setup-secret"];

    console.log("SETUP ADMIN REQUEST RECEIVED");
    console.log("Has setup secret:", !!setupSecret);
    console.log("Has request body:", !!req.body);

    if (!setupSecret || setupSecret !== process.env.SETUP_SECRET) {
      console.log("Setup secret check failed.");

      return res.status(403).json({
        success: false,
        message: "Unauthorized setup request."
      });
    }

    const { full_name, email, password } = req.body || {};

    console.log("Admin name received:", !!full_name);
    console.log("Admin email received:", !!email);
    console.log("Admin password received:", !!password);

    if (!full_name || !email || !password) {
      console.log("Required admin fields are missing.");

      return res.status(400).json({
        success: false,
        message: "Full name, email and password are required."
      });
    }

    /*
      Create the administrator in Supabase Authentication.
    */

    const { data, error } =
      await supabase.auth.admin.createUser({
        email: email.trim(),
        password: password,
        email_confirm: true
      });

    if (error) {
      console.error(
        "SUPABASE ADMIN CREATION ERROR:",
        error.message
      );

      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (!data || !data.user) {
      console.error(
        "SUPABASE DID NOT RETURN A USER."
      );

      return res.status(500).json({
        success: false,
        message: "Supabase did not return the new user."
      });
    }

    const user = data.user;

    /*
      Create the matching administrator profile
      in the Kenbridge users table.
    */

    try {
      await pool.query(
        `INSERT INTO users
        (id, full_name, email, role, password_hash, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.id,
          full_name.trim(),
          email.trim(),
          "ADMIN",
          null,
          true
        ]
      );
    } catch (databaseError) {
      console.error(
        "DATABASE ADMIN PROFILE ERROR:",
        databaseError.message
      );

      /*
        If the database profile fails,
        remove the Supabase Auth user so
        we don't leave an incomplete account.
      */

      try {
        await supabase.auth.admin.deleteUser(user.id);
      } catch (deleteError) {
        console.error(
          "FAILED TO ROLLBACK SUPABASE USER:",
          deleteError.message
        );
      }

      return res.status(500).json({
        success: false,
        message: "Administrator profile could not be created."
      });
    }

    return res.status(201).json({
      success: true,
      message: "Administrator account created successfully.",
      user: {
        id: user.id,
        full_name: full_name.trim(),
        email: email.trim(),
        role: "ADMIN"
      }
    });

  } catch (error) {
    console.error(
      "ADMIN SETUP ERROR:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to create administrator account."
    });
  }
});


/*
  LOGIN
  POST /api/auth/login
*/

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required."
      });
    }

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (error) {
      console.error(
        "LOGIN ERROR:",
        error.message
      );

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
    console.error(
      "LOGIN SERVER ERROR:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during login."
    });
  }
});


/*
  CURRENT USER
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
    console.error(
      "AUTHENTICATION ERROR:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Authentication failed."
    });
  }
});


module.exports = router;
