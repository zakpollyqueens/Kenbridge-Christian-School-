const express = require("express");
const router = express.Router();

const { supabase } = require("../config/supabase");
const { authenticateToken } = require("../middleware/auth");


/*
CHECK ADMIN ACCESS
*/
function requireAdmin(req, res) {
  const role = String(req.user?.role || "").toUpperCase();

  if (role !== "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Administrator access is required."
    });

    return false;
  }

  return true;
}


/*
GET ADMIN NOTIFICATION CENTER

GET /api/admin/notifications

Combines:
- Administrator notifications
- Staff tasks
- Messages
- Admissions
- Pending announcements
- Pending articles
*/
router.get("/", authenticateToken, async (req, res) => {

  try {

    if (!requireAdmin(req, res)) return;

    const adminId = req.user.id;

    const [
      notificationsResult,
      tasksResult,
      messagesResult,
      admissionsResult,
      announcementsResult,
      articlesResult
    ] = await Promise.all([

      /*
      ADMIN NOTIFICATIONS
      */
      supabase
        .from("staff_notifications")
        .select("*")
        .eq("user_id", adminId)
        .order("created_at", {
          ascending: false
        }),


      /*
      STAFF TASKS

      These show tasks created or assigned
      in the school system.
      */
      supabase
        .from("staff_tasks")
        .select("*")
        .order("created_at", {
          ascending: false
        })
        .limit(20),


      /*
      MESSAGES

      Messages specifically addressed
      to this administrator.
      */
      supabase
        .from("messages")
        .select("*")
        .eq("receiver_id", adminId)
        .order("created_at", {
          ascending: false
        })
        .limit(20),


      /*
      ADMISSIONS

      New admission applications.
      */
      supabase
        .from("admissions")
        .select("*")
        .order("created_at", {
          ascending: false
        })
        .limit(20),


      /*
      ANNOUNCEMENTS WAITING FOR APPROVAL
      */
      supabase
        .from("announcements")
        .select("*")
        .eq("is_published", false)
        .order("created_at", {
          ascending: false
        })
        .limit(20),


      /*
      ARTICLES WAITING FOR APPROVAL
      */
      supabase
        .from("articles")
        .select("*")
        .eq("is_published", false)
        .order("created_at", {
          ascending: false
        })
        .limit(20)

    ]);


    /*
    CHECK DATABASE ERRORS
    */
    const results = [
      notificationsResult,
      tasksResult,
      messagesResult,
      admissionsResult,
      announcementsResult,
      articlesResult
    ];

    for (const result of results) {

      if (result.error) {

        console.error(
          "ADMIN NOTIFICATION DATABASE ERROR:",
          result.error
        );

      }

    }


    const notifications = [];


    /*
    STORED ADMIN NOTIFICATIONS
    */
    (notificationsResult.data || []).forEach(item => {

      notifications.push({
        id: item.id,
        source: "notification",
        title: item.title || "Notification",
        body: item.message || "",
        is_read: item.is_read === true,
        created_at: item.created_at,
        notification_type:
          item.notification_type || "general"
      });

    });


    /*
    TASK NOTIFICATIONS
    */
    (tasksResult.data || []).forEach(task => {

      notifications.push({
        id: "task-" + task.id,
        source: "task",
        title: "📋 Staff Task: " + (task.title || "New Task"),
        body:
          task.description ||
          "A staff task requires attention.",
        is_read:
          String(task.status || "")
            .toUpperCase() === "COMPLETED",
        created_at: task.created_at,
        notification_type: "task",
        related_id: task.id,
        status: task.status,
        priority: task.priority
      });

    });


    /*
    MESSAGE NOTIFICATIONS
    */
    (messagesResult.data || []).forEach(message => {

      notifications.push({
        id: "message-" + message.id,
        source: "message",
        title:
          "💬 Message: " +
          (
            message.subject ||
            message.name ||
            "New Message"
          ),
        body:
          message.body ||
          message.message ||
          "",
        is_read: message.is_read === true,
        created_at: message.created_at,
        notification_type: "message",
        related_id: message.id
      });

    });


    /*
    ADMISSION NOTIFICATIONS
    */
    (admissionsResult.data || []).forEach(admission => {

      const status = String(
        admission.status || ""
      ).toUpperCase();

      notifications.push({
        id: "admission-" + admission.id,
        source: "admission",
        title:
          "🎓 Admission: " +
          (
            admission.student_name ||
            admission.applicant_name ||
            "New Application"
          ),
        body:
          "Requested class: " +
          (
            admission.requested_class ||
            "Not specified"
          ),
        is_read:
          status === "APPROVED" ||
          status === "REJECTED",
        created_at: admission.created_at,
        notification_type: "admission",
        related_id: admission.id,
        status: admission.status
      });

    });


    /*
    PENDING ANNOUNCEMENTS
    */
    (announcementsResult.data || []).forEach(item => {

      notifications.push({
        id: "announcement-" + item.id,
        source: "announcement",
        title:
          "📢 Pending Announcement: " +
          (
            item.title ||
            "Untitled Announcement"
          ),
        body:
          item.body ||
          "An announcement is waiting for approval.",
        is_read: false,
        created_at: item.created_at,
        notification_type: "content",
        related_id: item.id
      });

    });


    /*
    PENDING ARTICLES
    */
    (articlesResult.data || []).forEach(item => {

      notifications.push({
        id: "article-" + item.id,
        source: "article",
        title:
          "📝 Pending Article: " +
          (
            item.title ||
            "Untitled Article"
          ),
        body:
          item.excerpt ||
          "An article is waiting for approval.",
        is_read: false,
        created_at:
          item.created_at,
        notification_type: "content",
        related_id: item.id
      });

    });


    /*
    SORT EVERYTHING

    NEWEST FIRST
    */
    notifications.sort((a, b) => {

      return new Date(b.created_at || 0)
        - new Date(a.created_at || 0);

    });


    /*
    LIMIT RESPONSE
    */
    const finalNotifications =
      notifications.slice(0, 100);


    /*
    UNREAD COUNT
    */
    const unreadCount =
      finalNotifications.filter(
        item => !item.is_read
      ).length;


    return res.status(200).json({

      success: true,

      notifications:
        finalNotifications,

      unread_count:
        unreadCount

    });


  } catch (error) {

    console.error(
      "GET ADMIN NOTIFICATION CENTER ERROR:",
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
MARK ONE STORED NOTIFICATION AS READ

PATCH /api/admin/notifications/:id/read
*/
router.patch("/:id/read", authenticateToken, async (req, res) => {

  try {

    if (!requireAdmin(req, res)) return;

    const adminId =
      req.user.id;

    const notificationId =
      req.params.id;


    /*
    Only real notifications stored in
    staff_notifications can be updated.

    Generated notifications such as:
    task-UUID
    message-UUID
    admission-UUID

    are automatically generated from
    their source data.
    */
    if (
      notificationId.startsWith("task-") ||
      notificationId.startsWith("message-") ||
      notificationId.startsWith("admission-") ||
      notificationId.startsWith("announcement-") ||
      notificationId.startsWith("article-")
    ) {

      return res.status(200).json({

        success: true,

        message:
          "Generated notification acknowledged."

      });

    }


    const { data, error } =
      await supabase
        .from("staff_notifications")
        .update({
          is_read: true
        })
        .eq("id", notificationId)
        .eq("user_id", adminId)
        .select()
        .single();


    if (error) {
      throw error;
    }


    return res.status(200).json({

      success: true,

      message:
        "Notification marked as read.",

      notification:
        data

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
MARK ALL STORED ADMIN NOTIFICATIONS AS READ

PATCH /api/admin/notifications/read-all
*/
router.patch(
  "/read-all",
  authenticateToken,
  async (req, res) => {

    try {

      if (!requireAdmin(req, res)) return;

      const adminId =
        req.user.id;


      const { error } =
        await supabase
          .from("staff_notifications")
          .update({
            is_read: true
          })
          .eq("user_id", adminId)
          .eq("is_read", false);


      if (error) {
        throw error;
      }


      return res.status(200).json({

        success: true,

        message:
          "All stored notifications marked as read."

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

  }
);


/*
CLEAR STORED ADMIN NOTIFICATIONS

DELETE /api/admin/notifications
*/
router.delete(
  "/",
  authenticateToken,
  async (req, res) => {

    try {

      if (!requireAdmin(req, res)) return;

      const adminId =
        req.user.id;


      const { error } =
        await supabase
          .from("staff_notifications")
          .delete()
          .eq("user_id", adminId);


      if (error) {
        throw error;
      }


      return res.status(200).json({

        success: true,

        message:
          "Stored administrator notifications cleared."

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

  }
);


module.exports = router;
