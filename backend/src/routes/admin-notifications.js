const express = require("express");
const router = express.Router();

const { supabase } = require("../config/supabase");
const { authenticateToken } = require("../middleware/auth");


/*
GET ALL NOTIFICATIONS FOR THE LOGGED-IN ADMIN

GET /api/admin/notifications
*/
router.get("/", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("staff_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      notifications: data || []
    });

  } catch (error) {

    console.error(
      "GET ADMIN NOTIFICATIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to load administrator notifications."
    });

  }
});


/*
MARK ONE NOTIFICATION AS READ

PATCH /api/admin/notifications/:id/read
*/
router.patch("/:id/read", authenticateToken, async (req, res) => {
  try {

    const userId = req.user.id;
    const notificationId = req.params.id;

    const { data, error } = await supabase
      .from("staff_notifications")
      .update({
        is_read: true
      })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification: data
    });

  } catch (error) {

    console.error(
      "MARK ADMIN NOTIFICATION READ ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update notification."
    });

  }
});


/*
MARK ALL ADMIN NOTIFICATIONS AS READ

PATCH /api/admin/notifications/read-all
*/
router.patch("/read-all", authenticateToken, async (req, res) => {
  try {

    const userId = req.user.id;

    const { error } = await supabase
      .from("staff_notifications")
      .update({
        is_read: true
      })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read."
    });

  } catch (error) {

    console.error(
      "MARK ALL ADMIN NOTIFICATIONS READ ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to update notifications."
    });

  }
});


/*
CLEAR ALL ADMIN NOTIFICATIONS

DELETE /api/admin/notifications
*/
router.delete("/", authenticateToken, async (req, res) => {
  try {

    const userId = req.user.id;

    const { error } = await supabase
      .from("staff_notifications")
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message:
        "Administrator notifications cleared successfully."
    });

  } catch (error) {

    console.error(
      "CLEAR ADMIN NOTIFICATIONS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to clear notifications."
    });

  }
});


module.exports = router;
