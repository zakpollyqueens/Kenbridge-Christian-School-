const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

async function getAuthenticatedUser(req, res) {
try {
const token = req.headers.authorization?.replace("Bearer ", "");

if (!token) {
  res.status(401).json({ success: false, message: "Authorization token required." });
  return null;
}

const { data, error } = await supabase.auth.getUser(token);

if (error || !data?.user) {
  res.status(401).json({ success: false, message: "Invalid or expired authorization token." });
  return null;
}

return data.user;

} catch (error) {
console.error("PAYROLL AUTHENTICATION ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to verify authentication." });
return null;
}
}

async function getAdministrator(req, res) {
const user = await getAuthenticatedUser(req, res);
if (!user) return null;

try {
const { rows } = await pool.query(
"SELECT id, full_name, email, role, is_active FROM users WHERE id = $1 LIMIT 1",
[user.id]
);

const admin = rows[0];

if (!admin || !admin.is_active || String(admin.role).toUpperCase() !== "ADMIN") {
  res.status(403).json({
    success: false,
    message: !admin
      ? "Administrator profile not found."
      : !admin.is_active
        ? "Administrator account is inactive."
        : "Only administrators are authorized."
  });
  return null;
}

return admin;

} catch (error) {
console.error("PAYROLL ADMIN AUTHORIZATION ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to verify authorization." });
return null;
}
}

router.get("/my", async (req, res) => {
const user = await getAuthenticatedUser(req, res);
if (!user) return;

try {
const { rows: staffRows } = await pool.query(
"SELECT id, staff_number, first_name, last_name, department, job_title, employment_status FROM staff WHERE user_id = $1 LIMIT 1",
[user.id]
);

const staff = staffRows[0];

if (!staff) {
  return res.status(404).json({ success: false, message: "Staff profile not found." });
}

const { rows: payroll } = await pool.query(
  `SELECT id, staff_id, pay_month, gross_amount, deductions,
          net_amount, status, created_at
   FROM payroll
   WHERE staff_id = $1
   ORDER BY pay_month DESC, created_at DESC`,
  [staff.id]
);

res.json({ success: true, staff, latest: payroll[0] || null, payroll });

} catch (error) {
console.error("GET MY PAYROLL ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to retrieve payroll." });
}
});

router.get("/staff", async (req, res) => {
if (!await getAdministrator(req, res)) return;

try {
const { rows } = await pool.query(
"SELECT id, staff_number, first_name, last_name, department, job_title, employment_status FROM staff ORDER BY first_name, last_name"
);
res.json({ success: true, staff: rows });
} catch (error) {
console.error("GET PAYROLL STAFF ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to retrieve staff." });
}
});

router.get("/", async (req, res) => {
if (!await getAdministrator(req, res)) return;

try {
const { rows } = await pool.query(
"SELECT p.*, s.staff_number, s.first_name, s.last_name, s.department, s.job_title FROM payroll p JOIN staff s ON s.id = p.staff_id ORDER BY p.pay_month DESC, p.created_at DESC"
);
res.json({ success: true, payroll: rows });
} catch (error) {
console.error("GET ADMIN PAYROLL ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to retrieve payroll." });
}
});

router.post("/", async (req, res) => {
if (!await getAdministrator(req, res)) return;

try {
const { staff_id, pay_month, gross_amount, deductions = 0, status = "PENDING" } = req.body || {};
const gross = Number(gross_amount);
const deduct = Number(deductions);
const payrollStatus = String(status).trim().toUpperCase();

if (!staff_id || !pay_month || !Number.isFinite(gross) || !Number.isFinite(deduct) ||
    gross < 0 || deduct < 0 || deduct > gross ||
    !["PENDING", "PAID"].includes(payrollStatus)) {
  return res.status(400).json({ success: false, message: "Invalid payroll details." });
}

const { rows: staff } = await pool.query(
  "SELECT id FROM staff WHERE id = $1 LIMIT 1", [staff_id]
);
if (!staff[0]) {
  return res.status(404).json({ success: false, message: "Staff member not found." });
}

const { rows: existing } = await pool.query(
  "SELECT id FROM payroll WHERE staff_id = $1 AND pay_month = $2 LIMIT 1",
  [staff_id, pay_month]
);
if (existing[0]) {
  return res.status(409).json({ success: false, message: "Payroll already exists for this month." });
}

const { rows } = await pool.query(
  `INSERT INTO payroll
   (staff_id, pay_month, gross_amount, deductions, net_amount, status)
   VALUES ($1, $2, $3, $4, $5, $6)
   RETURNING *`,
  [staff_id, pay_month, gross, deduct, gross - deduct, payrollStatus]
);

res.status(201).json({ success: true, payroll: rows[0] });

} catch (error) {
console.error("CREATE PAYROLL ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to create payroll." });
}
});

router.put("/:id", async (req, res) => {

try {
const { pay_month, gross_amount, deductions = 0, status = "PENDING" } = req.body || {};
const gross = Number(gross_amount);
const deduct = Number(deductions);
const payrollStatus = String(status).trim().toUpperCase();

if (!pay_month || !Number.isFinite(gross) || !Number.isFinite(deduct) ||
    gross < 0 || deduct < 0 || deduct > gross ||
    !["PENDING", "PAID"].includes(payrollStatus)) {
  return res.status(400).json({ success: false, message: "Invalid payroll details." });
}

const { rows } = await pool.query(
  `UPDATE payroll
   SET pay_month = $1, gross_amount = $2, deductions = $3,
       net_amount = $4, status = $5
   WHERE id = $6
   RETURNING *`,
  [pay_month, gross, deduct, gross - deduct, payrollStatus, req.params.id]
);

if (!rows[0]) {
  return res.status(404).json({ success: false, message: "Payroll record not found." });
}

res.json({ success: true, payroll: rows[0] });

} catch (error) {
console.error("UPDATE PAYROLL ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to update payroll." });
}
});

router.delete("/:id", async (req, res) => {
if (!await getAdministrator(req, res)) return;

try {
const { rows } = await pool.query(
"DELETE FROM payroll WHERE id = $1 RETURNING id",
[req.params.id]
);

if (!rows[0]) {
  return res.status(404).json({ success: false, message: "Payroll record not found." });
}

res.json({ success: true, message: "Payroll deleted successfully." });

} catch (error) {
console.error("DELETE PAYROLL ERROR:", error.message);
res.status(500).json({ success: false, message: "Unable to delete payroll." });
}
});

module.exports = router;
