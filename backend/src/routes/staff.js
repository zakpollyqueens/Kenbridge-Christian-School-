const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

async function authenticateStaff(req, res) {
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
            message: "Invalid or expired staff session."
        });
        return null;
    }

    const { rows } = await pool.query(
        `SELECT id, full_name, username, email, role, position,
                department, phone, is_active
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [data.user.id]
    );

    const user = rows[0];

    if (!user) {
        res.status(403).json({
            success: false,
            message: "Staff account was not found."
        });
        return null;
    }

    if (!user.is_active) {
        res.status(403).json({
            success: false,
            message: "This staff account is inactive."
        });
        return null;
    }

    const role = String(user.role || "").toUpperCase();

    if (role !== "STAFF" && role !== "ADMIN") {
        res.status(403).json({
            success: false,
            message: "You do not have staff portal access."
        });
        return null;
    }

    return user;
}

/* ============================================================
   GET ACTIVE STAFF FOR ADMIN TASK ASSIGNMENT
   GET /api/staff/admin/list
   ADMIN ONLY
============================================================ */

router.get("/admin/list", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const role = String(user.role || "").toUpperCase();

        if (role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only administrators can view the staff assignment list."
            });
        }

        const { rows } = await pool.query(
            `SELECT
                id,
                full_name,
                username,
                email,
                role,
                position,
                department,
                phone,
                is_active
             FROM users
             WHERE is_active = TRUE
               AND UPPER(COALESCE(role, '')) IN ('STAFF', 'ADMIN')
             ORDER BY
                full_name ASC NULLS LAST,
                username ASC`
        );

        return res.status(200).json({
            success: true,
            staff: rows
        });

    } catch (error) {
        console.error("GET ADMIN STAFF LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve the staff list."
        });
    }
});
/* ============================================================
   GET STAFF PROFILE
   GET /api/staff/profile
============================================================ */

router.get("/profile", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const { rows } = await pool.query(
            `SELECT
                sp.id AS profile_id,
                sp.user_id,
                sp.employee_number,
                sp.full_name,
                sp.username,
                sp.email,
                sp.phone,
                sp.alternate_phone,
                sp.position,
                sp.department,
                sp.employment_type,
                sp.date_joined,
                sp.date_of_birth,
                sp.gender,
                sp.address,
                sp.profile_photo_url,
                sp.emergency_contact_name,
                sp.emergency_contact_phone,
                sp.emergency_contact_relationship,
                sp.bio,
                sp.qualifications,
                sp.is_active,
                sp.created_at,
                sp.updated_at,
                u.role
             FROM staff_profiles sp
             INNER JOIN users u
                ON u.id = sp.user_id
             WHERE sp.user_id = $1
             LIMIT 1`,
            [user.id]
        );

        const profile = rows[0];

        if (!profile) {
            return res.status(404).json({
                success: false,
                message: "A staff profile has not yet been created for this account."
            });
        }

        return res.status(200).json({
            success: true,
            profile
        });

    } catch (error) {
        console.error("GET STAFF PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve your staff profile."
        });
    }
});


/* ============================================================
   UPDATE STAFF PROFILE
   PATCH /api/staff/profile
============================================================ */

router.patch("/profile", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const {
            phone,
            alternate_phone,
            address,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            bio,
            qualifications,
            profile_photo_url
        } = req.body || {};

        const { rows } = await pool.query(
            `UPDATE staff_profiles
             SET
                phone = $1,
                alternate_phone = $2,
                address = $3,
                emergency_contact_name = $4,
                emergency_contact_phone = $5,
                emergency_contact_relationship = $6,
                bio = $7,
                qualifications = $8,
                profile_photo_url = $9,
                updated_at = NOW()
             WHERE user_id = $10
             RETURNING
                id AS profile_id,
                user_id,
                employee_number,
                full_name,
                username,
                email,
                phone,
                alternate_phone,
                position,
                department,
                employment_type,
                date_joined,
                date_of_birth,
                gender,
                address,
                profile_photo_url,
                emergency_contact_name,
                emergency_contact_phone,
                emergency_contact_relationship,
                bio,
                qualifications,
                is_active,
                created_at,
                updated_at`,
            [
                phone ? String(phone).trim() : null,
                alternate_phone ? String(alternate_phone).trim() : null,
                address ? String(address).trim() : null,
                emergency_contact_name
                    ? String(emergency_contact_name).trim()
                    : null,
                emergency_contact_phone
                    ? String(emergency_contact_phone).trim()
                    : null,
                emergency_contact_relationship
                    ? String(emergency_contact_relationship).trim()
                    : null,
                bio ? String(bio).trim() : null,
                qualifications
                    ? String(qualifications).trim()
                    : null,
                profile_photo_url
                    ? String(profile_photo_url).trim()
                    : null,
                user.id
            ]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "Staff profile was not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Staff profile updated successfully.",
            profile: rows[0]
        });

    } catch (error) {
        console.error("UPDATE STAFF PROFILE ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update your staff profile."
        });
    }
});


/* ============================================================
   GET STAFF DASHBOARD STATISTICS
   GET /api/staff/dashboard-stats
============================================================ */

router.get("/dashboard-stats", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const [
            studentsResult,
            tasksResult,
            notificationsResult
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::INTEGER AS count
                 FROM students`
            ),

            pool.query(
                `SELECT COUNT(*)::INTEGER AS count
                 FROM staff_tasks
                 WHERE assigned_to = $1
                 AND status IN ('PENDING', 'IN_PROGRESS')`,
                [user.id]
            ),

            pool.query(
                `SELECT COUNT(*)::INTEGER AS count
                 FROM staff_notifications
                 WHERE user_id = $1
                 AND is_read = FALSE`,
                [user.id]
            )
        ]);

        return res.status(200).json({
            success: true,
            statistics: {
                studentRecords:
                    studentsResult.rows[0]?.count || 0,

                pendingTasks:
                    tasksResult.rows[0]?.count || 0,

                unreadNotifications:
                    notificationsResult.rows[0]?.count || 0
            }
        });

    } catch (error) {
        console.error("GET STAFF DASHBOARD STATS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve dashboard statistics."
        });
    }
});


module.exports = router;
