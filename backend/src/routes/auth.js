/*
ADMIN PORTAL SETTINGS
GET /api/auth/settings
PUT /api/auth/settings
*/

async function getAuthenticatedAdmin(req) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    const error = new Error("Authorization token is required.");
    error.status = 401;
    throw error;
  }

  const accessToken = authorization.replace("Bearer ", "");

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data?.user) {
    const authError = new Error("Invalid or expired token.");
    authError.status = 401;
    throw authError;
  }

  const { rows } = await pool.query(
    `SELECT id, role, is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [data.user.id]
  );

  const user = rows[0];

  if (!user) {
    const profileError = new Error(
      "Authenticated account has no Kenbridge staff profile."
    );
    profileError.status = 403;
    throw profileError;
  }

  if (!user.is_active) {
    const inactiveError = new Error(
      "This account is inactive."
    );
    inactiveError.status = 403;
    throw inactiveError;
  }

  if (String(user.role).toUpperCase() !== "ADMIN") {
    const permissionError = new Error(
      "Only administrators can access portal settings."
    );
    permissionError.status = 403;
    throw permissionError;
  }

  return user;
}


/*
CREATE SETTINGS TABLE IF IT DOES NOT EXIST
*/

async function ensureAdminSettingsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      notifications BOOLEAN NOT NULL DEFAULT TRUE,
      auto_refresh BOOLEAN NOT NULL DEFAULT FALSE,
      default_content_status VARCHAR(30) NOT NULL DEFAULT 'Draft',
      portal_language VARCHAR(30) NOT NULL DEFAULT 'English',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}


/*
GET ADMIN SETTINGS
GET /api/auth/settings
*/

router.get("/settings", async (req, res) => {
  try {
    const admin = await getAuthenticatedAdmin(req);

    await ensureAdminSettingsTable();

    const { rows } = await pool.query(
      `SELECT
        notifications,
        auto_refresh,
        default_content_status,
        portal_language,
        created_at,
        updated_at
       FROM admin_settings
       WHERE user_id = $1
       LIMIT 1`,
      [admin.id]
    );

    let settings = rows[0];

    /*
    CREATE DEFAULT SETTINGS
    FOR A NEW ADMINISTRATOR
    */

    if (!settings) {
      const result = await pool.query(
        `INSERT INTO admin_settings (
          user_id,
          notifications,
          auto_refresh,
          default_content_status,
          portal_language
        )
        VALUES ($1, TRUE, FALSE, 'Draft', 'English')
        RETURNING
          notifications,
          auto_refresh,
          default_content_status,
          portal_language,
          created_at,
          updated_at`,
        [admin.id]
      );

      settings = result.rows[0];
    }

    return res.status(200).json({
      success: true,
      settings
    });

  } catch (error) {
    console.error(
      "GET ADMIN SETTINGS ERROR:",
      error.message
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Unable to retrieve administrator settings."
    });
  }
});


/*
UPDATE ADMIN SETTINGS
PUT /api/auth/settings
*/

router.put("/settings", async (req, res) => {
  try {
    const admin = await getAuthenticatedAdmin(req);

    await ensureAdminSettingsTable();

    const {
      notifications,
      auto_refresh,
      default_content_status,
      portal_language
    } = req.body || {};


    /*
    VALIDATE CONTENT STATUS
    */

    const allowedContentStatuses = [
      "Draft",
      "Pending",
      "Published"
    ];

    if (
      default_content_status !== undefined &&
      !allowedContentStatuses.includes(
        String(default_content_status)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid default content status."
      });
    }


    /*
    VALIDATE LANGUAGE
    */

    const allowedLanguages = [
      "English"
    ];

    if (
      portal_language !== undefined &&
      !allowedLanguages.includes(
        String(portal_language)
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid portal language."
      });
    }


    /*
    LOAD CURRENT SETTINGS
    */

    const existingResult = await pool.query(
      `SELECT
        notifications,
        auto_refresh,
        default_content_status,
        portal_language
       FROM admin_settings
       WHERE user_id = $1
       LIMIT 1`,
      [admin.id]
    );

    const existing =
      existingResult.rows[0] || {
        notifications: true,
        auto_refresh: false,
        default_content_status: "Draft",
        portal_language: "English"
      };


    /*
    MERGE NEW VALUES
    WITH EXISTING VALUES
    */

    const newNotifications =
      typeof notifications === "boolean"
        ? notifications
        : existing.notifications;

    const newAutoRefresh =
      typeof auto_refresh === "boolean"
        ? auto_refresh
        : existing.auto_refresh;

    const newDefaultContentStatus =
      default_content_status !== undefined
        ? String(default_content_status)
        : existing.default_content_status;

    const newPortalLanguage =
      portal_language !== undefined
        ? String(portal_language)
        : existing.portal_language;


    /*
    INSERT OR UPDATE SETTINGS
    */

    const result = await pool.query(
      `INSERT INTO admin_settings (
        user_id,
        notifications,
        auto_refresh,
        default_content_status,
        portal_language,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        notifications = EXCLUDED.notifications,
        auto_refresh = EXCLUDED.auto_refresh,
        default_content_status =
          EXCLUDED.default_content_status,
        portal_language =
          EXCLUDED.portal_language,
        updated_at = NOW()
      RETURNING
        notifications,
        auto_refresh,
        default_content_status,
        portal_language,
        created_at,
        updated_at`,
      [
        admin.id,
        newNotifications,
        newAutoRefresh,
        newDefaultContentStatus,
        newPortalLanguage
      ]
    );

    return res.status(200).json({
      success: true,
      message:
        "Administrator settings saved successfully.",
      settings: result.rows[0]
    });

  } catch (error) {
    console.error(
      "UPDATE ADMIN SETTINGS ERROR:",
      error.message
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        "Unable to save administrator settings."
    });
  }
});
module.exports = router;
