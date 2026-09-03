const express = require("express");
const router = express.Router();

const { supabase } = require("../config/supabase");
const { authenticateToken } = require("../middleware/auth");

/*
GET ALL NOTIFICATIONS FOR THE LOGGED-IN STAFF/ADMIN USER
GET /api/staff-notifications
*/
router.get("/", authenticateToken, async (req, res) => {
try {
const userId = req.user.id;

const { data, error } = await supabase
  .from("staff_notifications")
  .select("*")
  .eq("user_id", userId)
  .order("created_at", { ascending: false });

if (error) throw error;

return res.status(200).json({
  success: true,
  notifications: data || []
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
PATCH /api/staff-notifications/:id/read
*/
router.patch("/:id/read", authenticateToken, async (req, res) => {
try {
const userId = req.user.id;
const notificationId = req.params.id;

const { data, error } = await supabase
  .from("staff_notifications")
  .update({ is_read: true })
  .eq("id", notificationId)
  .eq("user_id", userId)
  .select()
  .single();

if (error) throw error;

return res.status(200).json({
  success: true,
  message: "Notification marked as read.",
  notification: data
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
PATCH /api/staff-notifications/read-all
*/
router.patch("/read-all", authenticateToken, async (req, res) => {
try {
const userId = req.user.id;

const { error } = await supabase
  .from("staff_notifications")
  .update({ is_read: true })
  .eq("user_id", userId)
  .eq("is_read", false);

if (error) throw error;

return res.status(200).json({
  success: true,
  message: "All notifications marked as read."
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
DELETE /api/staff-notifications
*/
router.delete("/", authenticateToken, async (req, res) => {
try {
const userId = req.user.id;

const { error } = await supabase
  .from("staff_notifications")
  .delete()
  .eq("user_id", userId);

if (error) throw error;

return res.status(200).json({
  success: true,
  message: "Notifications cleared successfully."
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
