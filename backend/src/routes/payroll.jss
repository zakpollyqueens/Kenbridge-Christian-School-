const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

async function getAuthenticatedUser(req, res) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authorization token is required."
      });
      return null;
    }

    const token = authorization.replace("Bearer ", "");

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired token."
      });
      return null;
    }

    return data.user;
  } catch (error) {
    console.error("PAYROLL AUTH ERROR:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to verify authentication."
    });

    return null;
  }
}

router.get("/my", async (req, res) => {
  const authUser = await getAuthenticatedUser(req, res);

  if (!authUser) return;

  try {
    /*
      Find the staff profile belonging to
      the authenticated user.
    */

    const { rows: staffRows } = await pool.query(
      `
      SELECT
        id,
        staff_number,
        first_name,
        last_name,
        department,
        job_title,
        employment_status
      FROM staff
      WHERE user_id = $1
      LIMIT 1
      `,
      [authUser.id]
    );

    const staff = staffRows[0];

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff profile was not found for this account."
      });
    }

    /*
      Get all payroll records belonging
      to this staff member.
    */

    const { rows: payrollRecords } = await pool.query(
      `
      SELECT
        id,
        staff_id,
        pay_month,
        gross_amount,
        deductions,
        net_amount,
        status,
        created_at
      FROM payroll
      WHERE staff_id = $1
      ORDER BY pay_month DESC, created_at DESC
      `,
      [staff.id]
    );

    return res.status(200).json({
      success: true,

      staff: {
        id: staff.id,
        staff_number: staff.staff_number,
        first_name: staff.first_name,
        last_name: staff.last_name,
        department: staff.department,
        job_title: staff.job_title,
        employment_status: staff.employment_status
      },

      latest: payrollRecords[0] || null,

      payroll: payrollRecords
    });

  } catch (error) {
    console.error("GET MY PAYROLL ERROR:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to load payroll information."
    });
  }
});

module.exports = router;
