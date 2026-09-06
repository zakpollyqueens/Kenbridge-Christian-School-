const express = require("express");
const multer = require("multer");
const path = require("path");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});

const ALLOWED_SECTIONS = [
    "GALLERY",
    "SPORTS",
    "FACILITIES",
    "PROJECTS"
];

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime"
];


/* =========================================================
   AUTHENTICATION
   ========================================================= */

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

        const {
            data,
            error
        } = await supabase.auth.getUser(token);

        if (error || !data?.user) {
            res.status(401).json({
                success: false,
                message: "Invalid or expired session."
            });
            return null;
        }

        const { rows } = await pool.query(
            `SELECT id, full_name, email, role, is_active
             FROM users
             WHERE id=$1
             LIMIT 1`,
            [data.user.id]
        );

        const user = rows[0];

        if (!user) {
            res.status(403).json({
                success: false,
                message: "Your staff profile was not found."
            });
            return null;
        }

        if (!user.is_active) {
            res.status(403).json({
                success: false,
                message: "Your staff account is inactive."
            });
            return null;
        }

        const role = String(user.role || "").toUpperCase();

        if (
            role !== "GENERAL_STAFF" &&
            role !== "ADMIN"
        ) {
            res.status(403).json({
                success: false,
                message: "Only General Staff and Administrators can submit website content."
            });
            return null;
        }

        return user;

    } catch (error) {

        console.error(
            "WEBSITE CONTENT AUTH ERROR:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Unable to verify your session."
        });

        return null;
    }
}


/* =========================================================
   SUBMIT WEBSITE CONTENT
   ========================================================= */

router.post(
    "/submit",
    upload.single("file"),
    async (req, res) => {

        try {

            const user = await getAuthenticatedUser(req, res);

            if (!user) return;

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Please select an image or video."
                });
            }

            const section =
                String(req.body.section || "")
                    .trim()
                    .toUpperCase();

            const title =
                String(req.body.title || "")
                    .trim();

            const description =
                String(req.body.description || "")
                    .trim() || null;


            /* SECTION CHECK */

            if (!ALLOWED_SECTIONS.includes(section)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid website section. Choose Gallery, Sports, Facilities, or Projects."
                });
            }


            /* TITLE CHECK */

            if (!title) {

                return res.status(400).json({
                    success: false,
                    message: "Content title is required."
                });
            }

            if (title.length > 200) {

                return res.status(400).json({
                    success: false,
                    message: "Content title cannot exceed 200 characters."
                });
            }


            /* MEDIA TYPE */

            const mimeType =
                String(req.file.mimetype || "")
                    .toLowerCase();

            let mediaType;

            if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {

                mediaType = "IMAGE";

            } else if (ALLOWED_VIDEO_TYPES.includes(mimeType)) {

                mediaType = "VIDEO";

            } else {

                return res.status(400).json({
                    success: false,
                    message:
                        "Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed."
                });
            }


            /* SAFE FILE NAME */

            const originalName =
                String(req.file.originalname || "media");

            const extension =
                path.extname(originalName).toLowerCase();

            const safeName =
                originalName
                    .replace(/[^a-zA-Z0-9._-]/g, "-");


            const storagePath =
                `${section.toLowerCase()}/${user.id}/${Date.now()}-${safeName}`;


            /* STORAGE UPLOAD */

            const {
                error: uploadError
            } = await supabase.storage
                .from("school-website-media")
                .upload(
                    storagePath,
                    req.file.buffer,
                    {
                        contentType: mimeType,
                        upsert: false
                    }
                );


            if (uploadError) {

                console.error(
                    "WEBSITE MEDIA STORAGE ERROR:",
                    uploadError.message
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "The media file could not be uploaded."
                });
            }


            /* PUBLIC URL */

            const {
                data: urlData
            } = supabase.storage
                .from("school-website-media")
                .getPublicUrl(storagePath);


            const mediaUrl =
                urlData?.publicUrl;


            if (!mediaUrl) {

                await supabase.storage
                    .from("school-website-media")
                    .remove([storagePath]);

                return res.status(500).json({
                    success: false,
                    message:
                        "The media URL could not be created."
                });
            }


            /* DATABASE RECORD */

            try {

                const {
                    rows
                } = await pool.query(
                    `INSERT INTO website_content_submissions
                    (
                        section,
                        title,
                        description,
                        media_type,
                        media_url,
                        storage_path,
                        file_name,
                        file_type,
                        file_size,
                        submitted_by,
                        status,
                        created_at,
                        updated_at
                    )
                    VALUES
                    (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                        'PENDING',
                        NOW(),
                        NOW()
                    )
                    RETURNING *`,
                    [
                        section,
                        title,
                        description,
                        mediaType,
                        mediaUrl,
                        storagePath,
                        originalName,
                        mimeType,
                        req.file.size,
                        user.id
                    ]
                );


                return res.status(201).json({
                    success: true,
                    message:
                        "Website content submitted successfully and is awaiting administrator approval.",
                    submission: rows[0]
                });


            } catch (databaseError) {

                console.error(
                    "WEBSITE CONTENT DATABASE ERROR:",
                    databaseError.message
                );

                await supabase.storage
                    .from("school-website-media")
                    .remove([storagePath]);

                return res.status(500).json({
                    success: false,
                    message:
                        "The media was uploaded but its database record could not be saved."
                });
            }


        } catch (error) {

            console.error(
                "WEBSITE CONTENT SUBMISSION ERROR:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    error.message ||
                    "Unable to submit website content."
            });
        }
    }
);


/* =========================================================
   GENERAL STAFF — VIEW OWN SUBMISSIONS
   ADMIN — VIEW ALL SUBMISSIONS
   ========================================================= */

router.get(
    "/submissions",
    async (req, res) => {

        try {

            const user =
                await getAuthenticatedUser(req, res);

            if (!user) return;

            const role =
                String(user.role || "")
                    .toUpperCase();

            let query;
            let values;

            if (role === "ADMIN") {

                query = `
                    SELECT
                        w.*,
                        u.full_name AS submitted_by_name,
                        u.email AS submitted_by_email
                    FROM website_content_submissions w
                    LEFT JOIN users u
                        ON w.submitted_by = u.id
                    ORDER BY w.created_at DESC
                `;

                values = [];

            } else {

                query = `
                    SELECT
                        w.*,
                        u.full_name AS submitted_by_name,
                        u.email AS submitted_by_email
                    FROM website_content_submissions w
                    LEFT JOIN users u
                        ON w.submitted_by = u.id
                    WHERE w.submitted_by = $1
                    ORDER BY w.created_at DESC
                ;

                values = [user.id];
            }


            const {
                rows
            } = await pool.query(
                query,
                values
            );


            return res.status(200).json({
                success: true,
                submissions: rows
            });


        } catch (error) {

            console.error(
                "GET WEBSITE SUBMISSIONS ERROR:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve website submissions."
            });
        }
    }
);


/* =========================================================
   ADMIN — APPROVE SUBMISSION
   ========================================================= */

router.patch(
    "/submissions/:id/approve",
    async (req, res) => {

        try {

            const user =
                await getAuthenticatedUser(req, res);

            if (!user) return;

            const role =
                String(user.role || "")
                    .toUpperCase();

            if (role !== "ADMIN") {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only Administrators can approve website content."
                });
            }


            const {
                rows
            } = await pool.query(
                `UPDATE website_content_submissions
                 SET
                    status='APPROVED',
                    reviewed_by=$1,
                    reviewed_at=NOW(),
                    rejection_reason=NULL,
                    updated_at=NOW()
                 WHERE id=$2
                   AND status='PENDING'
                 RETURNING *,
                [
                    user.id,
                    req.params.id
                ]
            );


            if (!rows[0]) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Pending website submission was not found."
                });
            }


            return res.status(200).json({
                success: true,
                message:
                    "Website content approved successfully.",
                submission: rows[0]
            });


        } catch (error) {

            console.error(
                "APPROVE WEBSITE CONTENT ERROR:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to approve website content."
            });
        }
    }
);


/* =========================================================
   ADMIN — REJECT SUBMISSION
   ========================================================= */

router.patch(
    "/submissions/:id/reject",
    async (req, res) => {

        try {

            const user =
                await getAuthenticatedUser(req, res);

            if (!user) return;

            const role =
                String(user.role || "")
                    .toUpperCase();

            if (role !== "ADMIN") {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only Administrators can reject website content."
                });
            }


            const reason =
                String(
                    req.body?.reason || ""
                ).trim();


            const {
                rows
            } = await pool.query(
                `UPDATE website_content_submissions
                 SET
                    status='REJECTED',
                    reviewed_by=$1,
                    reviewed_at=NOW(),
                    rejection_reason=$2,
                    updated_at=NOW()
                 WHERE id=$3
                   AND status='PENDING'
                 RETURNING *`,
                [
                    user.id,
                    reason || null,
                    req.params.id
                ]
            );


            if (!rows[0]) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Pending website submission was not found."
                });
            }


            return res.status(200).json({
                success: true,
                message:
                    "Website content rejected successfully.",
                submission: rows[0]
            });


        } catch (error) {

            console.error(
                "REJECT WEBSITE CONTENT ERROR:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to reject website content."
            });
        }
    }
);
/* =========================================================
   PUBLIC WEBSITE — APPROVED CONTENT
   ========================================================= */

router.get(
    "/published",
    async (req, res) => {

        try {

            const section =
                String(req.query.section || "")
                    .trim()
                    .toUpperCase();

            if (!ALLOWED_SECTIONS.includes(section)) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid website section."
                });

            }

            const { rows } = await pool.query(
                `SELECT
                    id,
                    section,
                    title,
                    description,
                    media_type,
                    media_url,
                    file_name,
                    created_at
                 FROM website_content_submissions
                 WHERE section=$1
                   AND status='APPROVED'
                 ORDER BY created_at DESC`,
                [section]
            );

            return res.status(200).json({
                success: true,
                section,
                content: rows
            });

        } catch (error) {

            console.error(
                "PUBLIC WEBSITE CONTENT ERROR:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load published website content."
            });
        }
    }
);

/* =========================================================
   MULTER ERROR HANDLER
   ========================================================= */

router.use(
    (error, req, res, next) => {

        if (error instanceof multer.MulterError) {

            if (error.code === "LIMIT_FILE_SIZE") {

                return res.status(400).json({
                    success: false,
                    message:
                        "The file is too large. Maximum size is 100 MB."
                });
            }

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        return next(error);
    }
);


module.exports = router;
