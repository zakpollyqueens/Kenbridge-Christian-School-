const express = require("express");
const router = express.Router();

const pool = require("../db");
const { authenticateToken } = require("../middleware/auth");

/*
GET ALL NOTIFICATIONS FOR THE LOGGED-IN STAFF USER
GET /api/notifications
*/
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        title,
        message,
        notification_type,
        is_read,
        created_at
      FROM staff_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      notifications: result.rows || []
    });

  } catch (error) {
    console.error("GET STAFF NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to load notifications."
    });
  }
});


/*
MARK ONE NOTIFICATION AS READ
PATCH /api/notifications/:id/read
*/
router.patch("/:id/read", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const result = await pool.query(
      `
      UPDATE staff_notifications
      SET is_read = TRUE
      WHERE id = $1
      AND user_id = $2
      RETURNING
        id,
        user_id,
        title,
        message,
        notification_type,
        is_read,
        created_at
      `,
      [notificationId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification: result.rows[0]
    });

  } catch (error) {
    console.error("MARK STAFF NOTIFICATION READ ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to update notification."
    });
  }
});


/*
MARK ALL NOTIFICATIONS AS READ
PATCH /api/notifications/read-all
*/
router.patch("/read-all", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      UPDATE staff_notifications
      SET is_read = TRUE
      WHERE user_id = $1
      AND is_read = FALSE
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      updated: result.rowCount
    });

  } catch (error) {
    console.error("MARK ALL STAFF NOTIFICATIONS READ ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to update notifications."
    });
  }
});


/*
CLEAR ALL NOTIFICATIONS FOR THE LOGGED-IN USER
DELETE /api/notifications
*/
router.delete("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `
      DELETE FROM staff_notifications
      WHERE user_id = $1
      `,
      [userId]
    );

    return res.status(200).json({
      success: true,
      message: "Notifications cleared successfully.",
      deleted: result.rowCount
    });

  } catch (error) {
    console.error("CLEAR STAFF NOTIFICATIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to clear notifications."
    });
  }
});

module.exports = router;
