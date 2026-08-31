const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

router.post("/setup-admin", async (req, res) => {
try {
if (req.headers["x-setup-secret"] !== process.env.SETUP_SECRET) {
return res.status(403).json({ success: false, message: "Unauthorized setup request." });
}

const { full_name, email, password } = req.body || {};
if (!full_name || !email || !password) {
  return res.status(400).json({ success: false, message: "Full name, email and password are required." });
}

const cleanEmail = email.trim().toLowerCase();
const { data, error } = await supabase.auth.admin.createUser({
  email: cleanEmail,
  password,
  email_confirm: true
});

if (error) return res.status(400).json({ success: false, message: error.message });
if (!data?.user) return res.status(500).json({ success: false, message: "Supabase did not return the new user." });

const user = data.user;

try {
  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, full_name.trim(), cleanEmail, "ADMIN", null, true]
  );
} catch (databaseError) {
  console.error("DATABASE ADMIN PROFILE ERROR:", databaseError.message);
  try {
    await supabase.auth.admin.deleteUser(user.id);
  } catch (deleteError) {
    console.error("FAILED TO ROLLBACK SUPABASE USER:", deleteError.message);
  }
  return res.status(500).json({ success: false, message: "Administrator profile could not be created." });
}

return res.status(201).json({
  success: true,
  message: "Administrator account created successfully.",
  user: { id: user.id, full_name: full_name.trim(), email: cleanEmail, role: "ADMIN" }
});

} catch (error) {
console.error("ADMIN SETUP ERROR:", error.message);
return res.status(500).json({ success: false, message: "Failed to create administrator account." });
}
});

router.post("/create-staff", async (req, res) => {
try {
const authorization = req.headers.authorization;
if (!authorization?.startsWith("Bearer ")) {
return res.status(401).json({ success: false, message: "Authorization token is required." });
}

const { data: authData, error: authError } = await supabase.auth.getUser(
  authorization.replace("Bearer ", "")
);

if (authError || !authData?.user) {
  return res.status(401).json({ success: false, message: "Invalid or expired administrator session." });
}

const adminResult = await pool.query(
  `SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1`,
  [authData.user.id]
);

if (!adminResult.rows.length) {
  return res.status(403).json({ success: false, message: "Administrator profile was not found." });
}

const admin = adminResult.rows[0];
if (!admin.is_active) {
  return res.status(403).json({ success: false, message: "Your administrator account is inactive." });
}

if (String(admin.role).toUpperCase() !== "ADMIN") {
  return res.status(403).json({ success: false, message: "Only administrators can create staff accounts." });
}

const {
  full_name, username, position, department, email,
  phone, password, is_active, notes
} = req.body || {};

if (!full_name || !username || !position || !department || !email || !password) {
  return res.status(400).json({
    success: false,
    message: "Full name, username, position, department, email and password are required."
  });
}

const cleanName = full_name.trim();
const cleanUsername = username.trim();
const cleanEmail = email.trim().toLowerCase();

const existingResult = await pool.query(
  `SELECT id FROM users
   WHERE LOWER(email) = LOWER($1) OR username = $2
   LIMIT 1`,
  [cleanEmail, cleanUsername]
);

if (existingResult.rows.length) {
  return res.status(409).json({
    success: false,
    message: "A staff account with this email or username already exists."
  });
}

const portalRole =
  position.trim().toLowerCase() === "administrator" ? "ADMIN" : "STAFF";

const { data: createData, error: createError } =
  await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true
  });

if (createError) {
  console.error("SUPABASE STAFF CREATION ERROR:", createError.message);
  return res.status(400).json({ success: false, message: createError.message });
}

if (!createData?.user) {
  return res.status(500).json({ success: false, message: "Supabase did not return the new staff user." });
}

const newUser = createData.user;

try {
  await pool.query(
    `INSERT INTO users
     (id, full_name, email, role, username, position, department, phone, notes, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      newUser.id,
      cleanName,
      cleanEmail,
      portalRole,
      cleanUsername,
      position.trim(),
      department.trim(),
      phone?.trim() || null,
      notes?.trim() || null,
      null,
      is_active !== false
    ]
  );
} catch (databaseError) {
  console.error("DATABASE STAFF CREATION ERROR:", databaseError.message);
  try {
    await supabase.auth.admin.deleteUser(newUser.id);
  } catch (deleteError) {
    console.error("FAILED TO ROLLBACK STAFF USER:", deleteError.message);
  }
  return res.status(500).json({
    success: false,
    message: "Staff profile could not be created in the school database."
  });
}

return res.status(201).json({
  success: true,
  message: "Staff account created successfully.",
  user: {
    id: newUser.id,
    full_name: cleanName,
    username: cleanUsername,
    email: cleanEmail,
    role: portalRole,
    position: position.trim(),
    department: department.trim(),
    is_active: is_active !== false
  }
});

} catch (error) {
console.error("CREATE STAFF SERVER ERROR:", error.message);
return res.status(500).json({
success: false,
message: "An unexpected error occurred while creating the staff account."
});
}
});

router.post("/login", async (req, res) => {
try {
const { email, password } = req.body || {};

if (!email || !password) {
  return res.status(400).json({ success: false, message: "Email and password are required." });
}

const { data, error } = await supabase.auth.signInWithPassword({
  email: email.trim().toLowerCase(),
  password
});

if (error || !data?.user || !data?.session) {
  console.error("LOGIN ERROR:", error?.message);
  return res.status(401).json({ success: false, message: "Invalid email or password." });
}

const profileResult = await pool.query(
  `SELECT id, full_name, email, role, is_active FROM users
