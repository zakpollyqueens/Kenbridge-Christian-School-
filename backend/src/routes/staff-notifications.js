const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

/* ============================================================
   AUTHENTICATE STAFF OR ADMIN
============================================================ */

async function authenticateStaff(req, res) {
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
                message: "Invalid or expired staff session."
            });

            return null;
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

    } catch (error) {
        console.error(
            "STAFF NOTIFICATION AUTHENTICATION ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to authenticate staff account."
        });

        return null;
    }
}


/* ============================================================
   GET ALL NOTIFICATIONS FOR LOGGED-IN STAFF
   GET /api/notifications
============================================================ */

router.get("/", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const { rows } = await pool.query(
            `SELECT
                id,
                user_id,
                title,
                message,
                type,
                is_read,
                created_at
             FROM staff_notifications
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [user.id]
        );

        return res.status(200).json({
            success: true,
            notifications: rows
        });

    } catch (error) {
        console.error(
            "GET STAFF NOTIFICATIONS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to load notifications."
        });
    }
});


/* ============================================================
   GET UNREAD NOTIFICATION COUNT
   GET /api/notifications/unread-count
============================================================ */

router.get("/unread-count", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const { rows } = await pool.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM staff_notifications
             WHERE user_id = $1
             AND is_read = FALSE`,
            [user.id]
        );

        return res.status(200).json({
            success: true,
            unreadCount: rows[0]?.count || 0
        });

    } catch (error) {
        console.error(
            "GET UNREAD NOTIFICATION COUNT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve unread notification count."
        });
    }
});


/* ============================================================
   MARK ALL NOTIFICATIONS AS READ
   PATCH /api/notifications/read-all

   IMPORTANT:
   This route must come before "/:id/read".
============================================================ */

router.patch("/read-all", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const { rowCount } = await pool.query(
            `UPDATE staff_notifications
             SET is_read = TRUE
             WHERE user_id = $1
             AND is_read = FALSE`,
            [user.id]
        );

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read.",
            updatedCount: rowCount
        });

    } catch (error) {
        console.error(
            "MARK ALL STAFF NOTIFICATIONS READ ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to update notifications."
        });
    }
});


/* ============================================================
   MARK ONE NOTIFICATION AS READ
   PATCH /api/notifications/:id/read
============================================================ */

router.patch("/:id/read", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const notificationId = req.params.id;

        const { rows } = await pool.query(
            `UPDATE staff_notifications
             SET is_read = TRUE
             WHERE id = $1
             AND user_id = $2
             RETURNING
                id,
                user_id,
                title,
                message,
                type,
                is_read,
                created_at`,
            [
                notificationId,
                user.id
            ]
        );

        if (!rows.length) {
            return res.status(404).json({
                success: false,
                message: "Notification was not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read.",
            notification: rows[0]
        });

    } catch (error) {
        console.error(
            "MARK STAFF NOTIFICATION READ ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to update notification."
        });
    }
});


/* ============================================================
   CLEAR ALL NOTIFICATIONS FOR LOGGED-IN STAFF
   DELETE /api/notifications
============================================================ */

router.delete("/", async (req, res) => {
    try {
        const user = await authenticateStaff(req, res);

        if (!user) {
            return;
        }

        const { rowCount } = await pool.query(
            `DELETE FROM staff_notifications
             WHERE user_id = $1`,
            [user.id]
        );

        return res.status(200).json({
            success: true,
            message: "Notifications cleared successfully.",
            deletedCount: rowCount
        });

    } catch (error) {
        console.error(
            "CLEAR STAFF NOTIFICATIONS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to clear notifications."
        });
    }
});


module.exports = router;
