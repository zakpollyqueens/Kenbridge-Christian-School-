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
  return res.status(400).json({
    success: false,
    message: "Full name, email and password are required."
  });
}

/*
  Create administrator in Supabase Authentication.
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
  return res.status(500).json({
    success: false,
    message: "Supabase did not return the new user."
  });
}

const user = data.user;

/*
  Create matching administrator profile
  in Kenbridge PostgreSQL database.
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
    Roll back Supabase user if database
    profile creation fails.
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

/*
  Authenticate using Supabase.
*/

const { data, error } =
  await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

if (error || !data?.user || !data?.session) {

  console.error(
    "LOGIN ERROR:",
    error?.message
  );

  return res.status(401).json({
    success: false,
    message: "Invalid email or password."
  });
}

/*
  Get the Kenbridge staff profile
  and role from PostgreSQL.
*/

const profileResult = await pool.query(
  `SELECT
    id,
    full_name,
    email,
    role,
    is_active
   FROM users
   WHERE id = $1
   LIMIT 1`,
  [data.user.id]
);

if (profileResult.rows.length === 0) {
  return res.status(403).json({
    success: false,
    message:
      "Your account is authenticated but is not registered in the Kenbridge staff system."
  });
}

const profile = profileResult.rows[0];

/*
  Prevent inactive accounts from
  accessing the school portal.
*/

if (!profile.is_active) {
  return res.status(403).json({
    success: false,
    message:
      "This account is inactive. Please contact the administrator."
  });
}

/*
  Return authenticated user and role.
*/

return res.status(200).json({
  success: true,
  message: "Login successful.",

  user: {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role
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
  message:
    "An unexpected error occurred during login."
});

}
});

/*
CURRENT AUTHENTICATED USER
GET /api/auth/me
*/

router.get("/me", async (req, res) => {
try {

const authorization =
  req.headers.authorization;

/*
  Check authorization header.
*/

if (
  !authorization ||
  !authorization.startsWith("Bearer ")
) {
  return res.status(401).json({
    success: false,
    message:
      "Authorization token is required."
  });
}

const token =
  authorization.replace("Bearer ", "");

/*
  Verify token with Supabase.
*/

const { data, error } =
  await supabase.auth.getUser(token);

if (error || !data?.user) {
  return res.status(401).json({
    success: false,
    message:
      "Invalid or expired token."
  });
}

/*
  Always retrieve the latest profile
  from the Kenbridge database.

  This ensures role changes and
  account deactivation work immediately.
*/

const profileResult = await pool.query(
  `SELECT
    id,
    full_name,
    email,
    role,
    is_active
   FROM users
   WHERE id = $1
   LIMIT 1`,
  [data.user.id]
);

if (profileResult.rows.length === 0) {
  return res.status(403).json({
    success: false,
    message:
      "Authenticated account has no Kenbridge staff profile."
  });
}

const profile =
  profileResult.rows[0];

/*
  Block inactive accounts.
*/

if (!profile.is_active) {
  return res.status(403).json({
    success: false,
    message:
      "This account is inactive."
  });
}

/*
  Return the complete Kenbridge
  portal user profile.
*/

return res.status(200).json({
  success: true,

  user: {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role
  }
});

} catch (error) {

console.error(
  "AUTHENTICATION ERROR:",
  error.message
);

return res.status(500).json({
  success: false,
  message:
    "Authentication failed."
});

}
});

module.exports = router;
