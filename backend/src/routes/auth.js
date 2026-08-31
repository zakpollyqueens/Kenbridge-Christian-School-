const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

router.post("/setup-admin", async (req, res) => {
try {
if (req.headers["x-setup-secret"] !== process.env.SETUP_SECRET)
return res.status(403).json({ success: false, message: "Unauthorized setup request." });

const { full_name, email, password } = req.body || {};
if (!full_name || !email || !password)
  return res.status(400).json({ success: false, message: "Full name, email and password are required." });

const normalizedEmail = String(email).trim().toLowerCase();
const { data, error } = await supabase.auth.admin.createUser({
  email: normalizedEmail,
  password: String(password),
  email_confirm: true
});

if (error || !data?.user)
  return res.status(400).json({
    success: false,
    message: error?.message || "Administrator authentication account could not be created."
  });

const user = data.user;

try {
  await pool.query(
    `INSERT INTO users (id, full_name, email, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, String(full_name).trim(), normalizedEmail, "ADMIN", null, true]
  );
} catch (databaseError) {
  console.error("DATABASE ADMIN PROFILE ERROR:", databaseError.message);
  await supabase.auth.admin.deleteUser(user.id).catch(err =>
    console.error("FAILED TO ROLLBACK SUPABASE USER:", err.message)
  );
  return res.status(500).json({ success: false, message: "Administrator profile could not be created." });
}

return res.status(201).json({
  success: true,
  message: "Administrator account created successfully.",
  user: { id: user.id, full_name: String(full_name).trim(), email: normalizedEmail, role: "ADMIN" }
});

} catch (error) {
console.error("ADMIN SETUP ERROR:", error.message);
return res.status(500).json({ success: false, message: "Failed to create administrator account." });
}
});

router.post("/create-staff", async (req, res) => {
let createdUserId = null;

try {
const authorization = req.headers.authorization;
if (!authorization?.startsWith("Bearer "))
return res.status(401).json({ success: false, message: "Administrator authorization token is required." });

const { data: authData, error: authError } = await supabase.auth.getUser(authorization.replace("Bearer ", ""));
if (authError || !authData?.user)
  return res.status(401).json({ success: false, message: "Invalid or expired administrator session." });

const { rows } = await pool.query(
  "SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1",
  [authData.user.id]
);
const administrator = rows[0];

if (!administrator)
  return res.status(403).json({ success: false, message: "Administrator profile was not found." });
if (!administrator.is_active)
  return res.status(403).json({ success: false, message: "Your administrator account is inactive." });
if (String(administrator.role).toUpperCase() !== "ADMIN")
  return res.status(403).json({ success: false, message: "Only administrators can create staff accounts." });

const { full_name, username, position, department, email, phone, password, is_active, notes } = req.body || {};
if (!full_name || !username || !position || !department || !email || !password)
  return res.status(400).json({ success: false, message: "Full name, username, position, department, email and password are required." });
if (String(password).length < 6)
  return res.status(400).json({ success: false, message: "Password must contain at least 6 characters." });

const normalizedEmail = String(email).trim().toLowerCase();
const normalizedUsername = String(username).trim();
const cleanPosition = String(position).trim();
const portalRole = cleanPosition.toLowerCase() === "administrator" ? "ADMIN" : "STAFF";

const { data: createdAuthData, error: createAuthError } =
  await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: String(password),
    email_confirm: true
  });

if (createAuthError || !createdAuthData?.user)
  return res.status(400).json({
    success: false,
    message: createAuthError?.message || "Staff authentication account could not be created."
  });

const createdUser = createdAuthData.user;
createdUserId = createdUser.id;

try {
  await pool.query(
    `INSERT INTO users
     (id, full_name, username, email, role, position, department, phone, notes,
      password_hash, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
    [
      createdUser.id,
      String(full_name).trim(),
      normalizedUsername,
      normalizedEmail,
      portalRole,
      cleanPosition,
      String(department).trim(),
      phone ? String(phone).trim() : null,
      notes ? String(notes).trim() : null,
      null,
      is_active !== false
    ]
  );
} catch (databaseError) {
  console.error("DATABASE STAFF PROFILE ERROR:", databaseError.message);
  await supabase.auth.admin.deleteUser(createdUser.id).catch(err =>
    console.error("FAILED TO ROLLBACK STAFF AUTH ACCOUNT:", err.message)
  );
  return res.status(500).json({ success: false, message: "Staff profile could not be saved in the database." });
}

return res.status(201).json({
  success: true,
  message: "Staff account created successfully.",
  user: {
    id: createdUser.id,
    full_name: String(full_name).trim(),
    username: normalizedUsername,
    position: cleanPosition,
    department: String(department).trim(),
    email: normalizedEmail,
    phone: phone ? String(phone).trim() : null,
    role: portalRole,
    is_active: is_active !== false,
    notes: notes ? String(notes).trim() : null
  }
});

} catch (error) {
console.error("CREATE STAFF SERVER ERROR:", error.message);
if (createdUserId)
await supabase.auth.admin.deleteUser(createdUserId).catch(err =>
console.error("ROLLBACK FAILED:", err.message)
);
return res.status(500).json({ success: false, message: "An unexpected error occurred while creating the staff account." });
}
});

router.post("/login", async (req, res) => {
try {
const { email, password } = req.body || {};
if (!email || !password)
return res.status(400).json({ success: false, message: "Email and password are required." });

const { data, error } = await supabase.auth.signInWithPassword({
  email: String(email).trim().toLowerCase(),
  password: String(password)
});

if (error || !data?.user || !data?.session)
  return res.status(401).json({ success: false, message: "Invalid email or password." });

const { rows } = await pool.query(
  `SELECT id, full_name, username, email, role, position, department, phone, notes, is_active
   FROM users WHERE id = $1 LIMIT 1`,
  [data.user.id]
);
const profile = rows[0];

if (!profile)
  return res.status(403).json({ success: false, message: "Account is not registered in the Kenbridge staff system." });
if (!profile.is_active)
  return res.status(403).json({ success: false, message: "This account is inactive." });

return res.status(200).json({
  success: true,
  message: "Login successful.",
  user: {
    id: profile.id,
    full_name: profile.full_name,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    position: profile.position,
    department: profile.department,
    phone: profile.phone,
    notes: profile.notes
  },
  session: {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at
  }
});

} catch (error) {
console.error("LOGIN SERVER ERROR:", error.message);
return res.status(500).json({ success: false, message: "An unexpected error occurred during login." });
}
});

router.get("/me", async (req, res) => {
try {
const authorization = req.headers.authorization;
if (!authorization?.startsWith("Bearer "))
return res.status(401).json({ success: false, message: "Authorization token is required." });

const { data, error } = await supabase.auth.getUser(authorization.replace("Bearer ", ""));
if (error || !data?.user)
  return res.status(401).json({ success: false, message: "Invalid or expired token." });

const { rows } = await pool.query(
  `SELECT id, full_name, username, email, role, position, department, phone, notes, is_active
   FROM users WHERE id = $1 LIMIT 1`,
  [data.user.id]
);
const profile = rows[0];

if (!profile)
  return res.status(403).json({ success: false, message: "Authenticated account has no staff profile." });
if (!profile.is_active)
  return res.status(403).json({ success: false, message: "This account is inactive." });

return res.status(200).json({
  success: true,
  user: {
    id: profile.id,
    full_name: profile.full_name,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    position: profile.position,
    department: profile.department,
    phone: profile.phone,
    notes: profile.notes
  }
});

} catch (error) {
console.error("AUTHENTICATION ERROR:", error.message);
return res.status(500).json({ success: false, message: "Authentication failed." });
}
});

router.get("/staff", async (req, res) => {
try {
const authorization = req.headers.authorization;
if (!authorization?.startsWith("Bearer "))
return res.status(401).json({ success: false, message: "Administrator authorization token is required." });

const { data: authData, error: authError } =
  await supabase.auth.getUser(authorization.replace("Bearer ", ""));
if (authError || !authData?.user)
  return res.status(401).json({ success: false, message: "Invalid or expired administrator session." });

const { rows: adminRows } = await pool.query(
  "SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1",
  [authData.user.id]
);
const administrator = adminRows[0];

if (!administrator)
  return res.status(403).json({ success: false, message: "Administrator profile was not found." });
if (!administrator.is_active)
  return res.status(403).json({ success: false, message: "Your administrator account is inactive." });
if (String(administrator.role).toUpperCase() !== "ADMIN")
  return res.status(403).json({ success: false, message: "Only administrators can view staff accounts." });

const { rows: staff } = await pool.query(
  `SELECT id, full_name, username, email, role, position, department, phone, notes,
          is_active, created_at, updated_at
   FROM users ORDER BY full_name ASC`
);

return res.status(200).json({ success: true, staff });

} catch (error) {
console.error("GET STAFF ACCOUNTS ERROR:", error.message);
return res.status(500).json({ success: false, message: "Unable to retrieve staff accounts." });
}
});

module.exports = router;
