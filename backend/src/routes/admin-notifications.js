const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const pool = require("../db");

async function authenticateAdmin(req, res) {
try {
const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
        res.status(401).json({ success: false, message: "Authorization token is required." });
        return null;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        res.status(401).json({ success: false, message: "Invalid or expired admin session." });
        return null;
    }

    const { rows } = await pool.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [data.user.id]
    );
    const user = rows[0];

    if (!user) {
        res.status(403).json({ success: false, message: "Administrator account was not found." });
        return null;
    }

    if (!user.is_active || String(user.role).toUpperCase() !== "ADMIN") {
        res.status(403).json({ success: false, message: "Administrator access is required." });
        return null;
    }

    return user;
} catch (error) {
    console.error("ADMIN NOTIFICATION AUTHENTICATION ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to authenticate administrator." });
    return null;
}

}

router.get("/", async (req, res) => {
try {
if (!await authenticateAdmin(req, res)) return;

    const { rows } = await pool.query(
        `SELECT sn.*, u.full_name, u.username, u.email, u.role, u.department
         FROM staff_notifications sn
         LEFT JOIN users u ON u.id = sn.user_id
         ORDER BY sn.created_at DESC`
    );

    res.json({ success: true, notifications: rows });
} catch (error) {
    console.error("GET ADMIN NOTIFICATIONS ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to retrieve notifications." });
}

});

router.get("/unread-count", async (req, res) => {
try {
if (!await authenticateAdmin(req, res)) return;

    const { rows } = await pool.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM staff_notifications
         WHERE is_read = FALSE`
    );

    res.json({ success: true, unreadCount: rows[0]?.count || 0 });
} catch (error) {
    console.error("GET ADMIN UNREAD NOTIFICATION COUNT ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to retrieve unread notification count." });
}

});

router.get("/staff", async (req, res) => {
try {
if (!await authenticateAdmin(req, res)) return;

    const { rows } = await pool.query(
        `SELECT id, full_name, username, email, role, position, department
         FROM users
         WHERE is_active = TRUE
         AND UPPER(COALESCE(role, '')) IN ('STAFF', 'ADMIN')
         ORDER BY full_name ASC NULLS LAST, username ASC`
    );

    res.json({ success: true, staff: rows });
} catch (error) {
    console.error("GET NOTIFICATION STAFF LIST ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to retrieve staff list." });
}

});

async function createNotification(userId, title, message, type = "GENERAL") {
const { rows } = await pool.query(
"INSERT INTO staff_notifications (user_id, title, message, type, is_read, created_at) VALUES ($1, $2, $3, $4, FALSE, NOW()) RETURNING id, user_id, title, message, type, is_read, created_at",
[userId, title.trim(), message.trim(), type.trim().toUpperCase()]
);
return rows[0];
}

router.post("/", async (req, res) => {
try {
if (!await authenticateAdmin(req, res)) return;

    const { user_id, title, message, type = "GENERAL" } = req.body || {};

    if (!user_id) return res.status(400).json({ success: false, message: "A staff member must be selected." });
    if (!title?.trim()) return res.status(400).json({ success: false, message: "Notification title is required." });
    if (!message?.trim()) return res.status(400).json({ success: false, message: "Notification message is required." });

    const { rows } = await pool.query(
        `SELECT id, is_active FROM users WHERE id = $1 LIMIT 1`,
        [user_id]
    );

    if (!rows.length) return res.status(404).json({ success: false, message: "Selected staff account was not found." });
    if (!rows[0].is_active) return res.status(400).json({ success: false, message: "The selected staff account is inactive." });

    const notification = await createNotification(user_id, title, message, type);
    res.status(201).json({ success: true, message: "Notification sent successfully.", notification });
} catch (error) {
    console.error("CREATE ADMIN NOTIFICATION ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to send notification." });
}

});

router.post("/broadcast", async (req, res) => {
try {
if (!await authenticateAdmin(req, res)) return;

    const { user_ids, title, message, type = "GENERAL" } = req.body || {};

    if (!Array.isArray(user_ids) || !user_ids.length) {
        return res.status(400).json({ success: false, message: "Select at least one staff member." });
    }
    if (!title?.trim()) return res.status(400).json({ success: false, message: "Notification title is required." });
    if (!message?.trim()) return res.status(400).json({ success: false, message: "Notification message is required." });

    const ids = [...new Set(user_ids.filter(Boolean).map(String))];
    const { rows: staff } = await pool.query(
        `SELECT id FROM users
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
        [ids]
    );

    if (!staff.length) {
        return res.status(400).json({ success: false, message: "No active staff accounts were found." });
    }

    const notifications = [];
    for (const user of staff) {
        notifications.push(await createNotification(user.id, title, message, type));
    }

    res.status(201).json({
        success: true,
        message: "Notifications sent successfully.",
        sentCount: notifications.length,
        notifications
    });
} catch (error) {
    console.error("BROADCAST ADMIN NOTIFICATION ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to send notifications." });
}

});

router.delete("/", async (req, res) => {
try {
if (!await authenticateAdmin(req, res)) return;

    const { rows } = await pool.query(
        `DELETE FROM staff_notifications WHERE id = $1 RETURNING id`,
        [req.params.id]
    );

    if (!rows.length) {
        return res.status(404).json({ success: false, message: "Notification was not found." });
    }

    res.json({ success: true, message: "Notification deleted successfully." });
} catch (error) {
    console.error("DELETE ADMIN NOTIFICATION ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to delete notification." });
}

});

module.exports = router;
