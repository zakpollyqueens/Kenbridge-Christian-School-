const express = require("express");
const multer = require("multer");
const path = require("path");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

const ALLOWED_SECTIONS = ["GALLERY", "SPORTS", "FACILITIES", "PROJECTS"];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"];

const upload = multer({
storage: multer.memoryStorage(),
limits: { fileSize: 100 * 1024 * 1024 }
});

async function getAuthenticatedUser(req, res) {
try {
const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        res.status(401).json({ success: false, message: "Authorization token is required." });
        return null;
    }

    const { data, error } = await supabase.auth.getUser(
        authorization.replace("Bearer ", "")
    );

    if (error || !data?.user) {
        res.status(401).json({ success: false, message: "Invalid or expired session." });
        return null;
    }

    const { rows } = await pool.query(
        `SELECT id, full_name, email, role, is_active
         FROM users WHERE id=$1 LIMIT 1`,
        [data.user.id]
    );

    const user = rows[0];

    if (!user) {
        res.status(403).json({ success: false, message: "Your staff profile was not found." });
        return null;
    }

    if (!user.is_active) {
        res.status(403).json({ success: false, message: "Your staff account is inactive." });
        return null;
    }

    return user;
} catch (error) {
    console.error("WEBSITE CONTENT AUTH ERROR:", error.message);
    res.status(500).json({ success: false, message: "Unable to verify your session." });
    return null;
}

}

router.post("/submissions", upload.single("file"), async (req, res) => {
try {
const user = await getAuthenticatedUser(req, res);
if (!user) return;

    const role = String(user.role || "").toUpperCase();
    if (!["GENERAL_STAFF", "STAFF", "ADMIN"].includes(role)) {
        return res.status(403).json({
            success: false,
            message: "You do not have permission to submit website content."
        });
    }

    const section = String(req.body.section || "").trim().toUpperCase();
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();

    if (!ALLOWED_SECTIONS.includes(section)) {
        return res.status(400).json({ success: false, message: "Please select a valid website section." });
    }

    if (!title) {
        return res.status(400).json({ success: false, message: "Content title is required." });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: "Please select an image or video." });
    }

    const mimetype = String(req.file.mimetype || "").toLowerCase();
    const mediaType = ALLOWED_IMAGE_TYPES.includes(mimetype)
        ? "IMAGE"
        : ALLOWED_VIDEO_TYPES.includes(mimetype)
            ? "VIDEO"
            : null;

    if (!mediaType) {
        return res.status(400).json({
            success: false,
            message: "Only JPG, JPEG, PNG, WEBP, MP4, WEBM and OGG files are allowed."
        });
    }

    const originalName = req.file.originalname;
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = `${section.toLowerCase()}/${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from("website-content")
        .upload(storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false
        });

    if (uploadError) {
        console.error("WEBSITE CONTENT STORAGE ERROR:", uploadError.message);
        return res.status(500).json({ success: false, message: "Unable to upload the media file." });
    }

    const { data: urlData } = supabase.storage
        .from("website-content")
        .getPublicUrl(storagePath);

    const mediaUrl = urlData?.publicUrl;

    if (!mediaUrl) {
        await supabase.storage.from("website-content").remove([storagePath]);
        return res.status(500).json({ success: false, message: "Unable to create the media URL." });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO website_content_submissions
            (section, title, description, media_type, media_url, storage_path,
             file_name, file_size, submitted_by, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', NOW(), NOW())
            RETURNING *`,
            [
                section,
                title,
                description || null,
                mediaType,
                mediaUrl,
                storagePath,
                originalName,
                req.file.size,
                user.id
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Website content submitted successfully and is awaiting administrator approval.",
            submission: rows[0]
        });
    } catch (databaseError) {
        console.error("WEBSITE CONTENT DATABASE ERROR:", databaseError.message);
        await supabase.storage.from("website-content").remove([storagePath]);

        return res.status(500).json({
            success: false,
            message: "The media was uploaded but its submission record could not be saved."
        });
    }
} catch (error) {
    console.error("WEBSITE CONTENT SUBMISSION ERROR:", error.message);
    return res.status(500).json({
        success: false,
        message: error.message || "Unable to submit website content."
    });
}

});

router.get("/submissions", async (req, res) => {
try {
const user = await getAuthenticatedUser(req, res);
if (!user) return;

    const isAdmin = String(user.role || "").toUpperCase() === "ADMIN";
    const query = `
        SELECT w.*, u.full_name AS submitted_by_name, r.full_name AS reviewed_by_name
        FROM website_content_submissions w
        LEFT JOIN users u ON w.submitted_by=u.id
        LEFT JOIN users r ON w.reviewed_by=r.id
        ${isAdmin ? "" : "WHERE w.submitted_by=$1"}
        ORDER BY w.created_at DESC`;

    const { rows } = await pool.query(query, isAdmin ? [] : [user.id]);
    return res.status(200).json({ success: true, submissions: rows });
} catch (error) {
    console.error("GET WEBSITE SUBMISSIONS ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve website submissions." });
}

});

async function reviewSubmission(req, res, status) {
try {
const user = await getAuthenticatedUser(req, res);
if (!user) return;

    if (String(user.role || "").toUpperCase() !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: `Only Administrators can ${status.toLowerCase()} website content.`
        });
    }

    const reason = status === "REJECTED"
        ? String(req.body?.reason || "").trim() || null
        : null;

    const { rows } = await pool.query(
        `UPDATE website_content_submissions
         SET status=$1, reviewed_by=$2, reviewed_at=NOW(),
             rejection_reason=$3, updated_at=NOW()
         WHERE id=$4 AND status='PENDING'
         RETURNING *`,
        [status, user.id, reason, req.params.id]
    );

    if (!rows[0]) {
        return res.status(404).json({
            success: false,
            message: "Pending website submission was not found."
        });
    }

    return res.status(200).json({
        success: true,
        message: `Website content ${status.toLowerCase()} successfully.`,
        submission: rows[0]
    });
} catch (error) {
    console.error(`WEBSITE CONTENT ${status} ERROR:`, error.message);
    return res.status(500).json({
        success: false,
        message: `Unable to ${status.toLowerCase()} website content.`
    });
}

}

router.patch("/submissions//approve", (req, res) =>
reviewSubmission(req, res, "APPROVED")
);

router.patch("/submissions//reject", (req, res) =>
reviewSubmission(req, res, "REJECTED")
);

router.get("/published", async (req, res) => {
try {
const section = String(req.query.section || "").trim().toUpperCase();

    if (!ALLOWED_SECTIONS.includes(section)) {
        return res.status(400).json({ success: false, message: "Invalid website section." });
    }

    const { rows } = await pool.query(
        `SELECT id, section, title, description, media_type, media_url, file_name, created_at
         FROM website_content_submissions
         WHERE section=$1 AND status='APPROVED'
         ORDER BY created_at DESC`,
        [section]
    );

    return res.status(200).json({ success: true, section, content: rows });
} catch (error) {
    console.error("PUBLIC WEBSITE CONTENT ERROR:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load published website content." });
}

});

router.use((error, req, res, next) => {
if (error instanceof multer.MulterError) {
return res.status(400).json({
success: false,
message: error.code === "LIMIT_FILE_SIZE"
? "The file is too large. Maximum size is 100 MB."
: error.message
});
}

next(error);

});

module.exports = router;
