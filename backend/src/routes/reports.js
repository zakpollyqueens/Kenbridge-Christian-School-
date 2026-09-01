const express = require("express");
const supabase = require("../supabase");
const pool = require("../db");

const router = express.Router();

const ALLOWED_CLASSES = [
  "BABY",
  "MIDDLE",
  "TOP",
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "P7"
];

async function getAuthenticatedUser(req) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Authorization token is required.");
  }

  const token = authorization.replace("Bearer ", "");

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    throw new Error("Invalid or expired session.");
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
      is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [data.user.id]
  );

  const user = rows[0];

  if (!user) {
    throw new Error("Your staff profile was not found.");
  }

  if (!user.is_active) {
    throw new Error("This account is inactive.");
  }

  return user;
}

function normaliseClassName(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function ensureValidClass(className) {
  if (!ALLOWED_CLASSES.includes(className)) {
    throw new Error("Invalid class.");
  }
}

/*
====================================================
GET ALL CLASSES WITH REAL LEARNER/REPORT STATISTICS
GET /api/reports/classes
====================================================
*/

router.get("/classes", async (req, res) => {
  try {
    await getAuthenticatedUser(req);

    const { academic_year, term } = req.query;

    const { rows } = await pool.query(
      `SELECT
        UPPER(TRIM(s.class_name)) AS class_name,

        COUNT(DISTINCT s.id) AS total_students,

        COUNT(DISTINCT sr.id) FILTER (
          WHERE sr.report_status = 'DRAFT'
        ) AS draft_reports,

        COUNT(DISTINCT sr.id) FILTER (
          WHERE sr.report_status = 'SUBMITTED'
        ) AS submitted_reports,

        COUNT(DISTINCT sr.id) FILTER (
          WHERE sr.report_status = 'APPROVED'
        ) AS approved_reports,

        COUNT(DISTINCT sr.id) AS total_reports

       FROM students s

       LEFT JOIN student_reports sr
         ON sr.student_id = s.id
         AND ($1::text IS NULL OR sr.academic_year = $1)
         AND ($2::text IS NULL OR sr.term = $2)

       WHERE s.is_active = true

       GROUP BY UPPER(TRIM(s.class_name))

       ORDER BY
         CASE UPPER(TRIM(s.class_name))
           WHEN 'BABY' THEN 1
           WHEN 'MIDDLE' THEN 2
           WHEN 'TOP' THEN 3
           WHEN 'P1' THEN 4
           WHEN 'P2' THEN 5
           WHEN 'P3' THEN 6
           WHEN 'P4' THEN 7
           WHEN 'P5' THEN 8
           WHEN 'P6' THEN 9
           WHEN 'P7' THEN 10
           ELSE 99
         END`,
      [
        academic_year || null,
        term || null
      ]
    );

    const existingClasses = new Map(
      rows.map(row => [
        normaliseClassName(row.class_name),
        row
      ])
    );

    const classes = ALLOWED_CLASSES.map(className => {
      const data = existingClasses.get(className);

      return {
        class_name: className,
        total_students: Number(data?.total_students || 0),
        total_reports: Number(data?.total_reports || 0),
        draft_reports: Number(data?.draft_reports || 0),
        submitted_reports: Number(data?.submitted_reports || 0),
        approved_reports: Number(data?.approved_reports || 0)
      };
    });

    return res.status(200).json({
      success: true,
      classes
    });

  } catch (error) {

    console.error(
      "GET REPORT CLASSES ERROR:",
      error.message
    );

    return res.status(401).json({
      success: false,
      message: error.message || "Unable to load classes."
    });
  }
});

/*
====================================================
GET LEARNERS AND REPORT STATUS FOR ONE CLASS
GET /api/reports/classes/:className
====================================================
*/

router.get("/classes/:className", async (req, res) => {
  try {
    await getAuthenticatedUser(req);

    const className = normaliseClassName(
      req.params.className
    );

    ensureValidClass(className);

    const academicYear =
      String(req.query.academic_year || "").trim();

    const term =
      String(req.query.term || "").trim();

    const { rows } = await pool.query(
      `SELECT
        s.id AS student_id,
        s.full_name,
        s.class_name,

        sr.id AS report_id,
        sr.academic_year,
        sr.term,
        sr.subject_marks,
        sr.subject_grades,
        sr.aggregate,
        sr.overall_grade,
        sr.attendance_days,
        sr.total_school_days,
        sr.report_status,
        sr.updated_at

       FROM students s

       LEFT JOIN student_reports sr
         ON sr.student_id = s.id
         AND (
           $2::text = ''
           OR sr.academic_year = $2
         )
         AND (
           $3::text = ''
           OR sr.term = $3
         )

       WHERE UPPER(TRIM(s.class_name)) = $1
         AND s.is_active = true

       ORDER BY s.full_name ASC`,
      [
        className,
        academicYear,
        term
      ]
    );

    return res.status(200).json({
      success: true,
      class_name: className,
      academic_year: academicYear || null,
      term: term || null,
      students: rows.map(student => ({
        ...student,
        aggregate:
          student.aggregate === null
            ? null
            : Number(student.aggregate),

        report_status:
          student.report_status || "NOT_STARTED"
      }))
    });

  } catch (error) {

    console.error(
      "GET CLASS REPORTS ERROR:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to load class reports."
    });
  }
});

/*
====================================================
GET ONE STUDENT REPORT
GET /api/reports/student/:studentId
====================================================
*/

router.get("/student/:studentId", async (req, res) => {
  try {
    await getAuthenticatedUser(req);

    const studentId = req.params.studentId;

    const academicYear =
      String(req.query.academic_year || "").trim();

    const term =
      String(req.query.term || "").trim();

    const { rows } = await pool.query(
      `SELECT
        s.id AS student_id,
        s.full_name,
        s.class_name,

        sr.id AS report_id,
        sr.teacher_id,
        sr.academic_year,
        sr.term,
        sr.subject_marks,
        sr.subject_grades,
        sr.aggregate,
        sr.overall_grade,
        sr.attendance_days,
        sr.total_school_days,
        sr.teacher_comment,
        sr.head_teacher_comment,
        sr.report_status,
        sr.submitted_at,
        sr.approved_at,
        sr.approved_by,
        sr.created_at,
        sr.updated_at

       FROM students s

       LEFT JOIN student_reports sr
         ON sr.student_id = s.id
         AND (
           $2::text = ''
           OR sr.academic_year = $2
         )
         AND (
           $3::text = ''
           OR sr.term = $3
         )

       WHERE s.id = $1
       LIMIT 1`,
      [
        studentId,
        academicYear,
        term
      ]
    );

    const student = rows[0];

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Learner was not found."
      });
    }

    if (
      student.aggregate !== null &&
      student.aggregate !== undefined
    ) {
      student.aggregate =
        Number(student.aggregate);
    }

    return res.status(200).json({
      success: true,
      student
    });

  } catch (error) {

    console.error(
      "GET STUDENT REPORT ERROR:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to load learner report."
    });
  }
});

/*
====================================================
CREATE REPORT
POST /api/reports
====================================================
*/

router.post("/", async (req, res) => {
  try {
    const user =
      await getAuthenticatedUser(req);

    const {
      student_id,
      academic_year,
      term,
      subject_marks,
      subject_grades,
      aggregate,
      overall_grade,
      attendance_days,
      total_school_days,
      teacher_comment
    } = req.body || {};

    if (
      !student_id ||
      !academic_year ||
      !term
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Student, academic year and term are required."
      });
    }

    const studentResult =
      await pool.query(
        `SELECT
          id,
          full_name,
          class_name,
          is_active
         FROM students
         WHERE id = $1
         LIMIT 1`,
        [student_id]
      );

    const student =
      studentResult.rows[0];

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Learner was not found."
      });
    }

    if (!student.is_active) {
      return res.status(400).json({
        success: false,
        message:
          "This learner is inactive."
      });
    }

    const className =
      normaliseClassName(
        student.class_name
      );

    ensureValidClass(className);

    const existing =
      await pool.query(
        `SELECT id
         FROM student_reports
         WHERE student_id = $1
           AND academic_year = $2
           AND term = $3
         LIMIT 1`,
        [
          student_id,
          String(academic_year).trim(),
          String(term).trim()
        ]
      );

    if (existing.rows.length) {
      return res.status(409).json({
        success: false,
        message:
          "A report already exists for this learner, term and academic year."
      });
    }

    const { rows } =
      await pool.query(
        `INSERT INTO student_reports (
          student_id,
          teacher_id,
          class_name,
          academic_year,
          term,
          subject_marks,
          subject_grades,
          aggregate,
          overall_grade,
          attendance_days,
          total_school_days,
          teacher_comment,
          report_status
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,'DRAFT'
        )
        RETURNING *`,
        [
          student_id,
          user.id,
          className,
          String(academic_year).trim(),
          String(term).trim(),
          subject_marks || {},
          subject_grades || {},
          aggregate ?? null,
          overall_grade || null,
          Number(attendance_days || 0),
          Number(total_school_days || 0),
          teacher_comment || null
        ]
      );

    return res.status(201).json({
      success: true,
      message:
        "Learner report created successfully.",
      report: rows[0]
    });

  } catch (error) {

    console.error(
      "CREATE STUDENT REPORT ERROR:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to create learner report."
    });
  }
});

/*
====================================================
UPDATE REPORT
PATCH /api/reports/:reportId
====================================================
*/

router.patch("/:reportId", async (req, res) => {
  try {
    const user =
      await getAuthenticatedUser(req);

    const reportId =
      req.params.reportId;

    const {
      subject_marks,
      subject_grades,
      aggregate,
      overall_grade,
      attendance_days,
      total_school_days,
      teacher_comment
    } = req.body || {};

    const existingResult =
      await pool.query(
        `SELECT *
         FROM student_reports
         WHERE id = $1
         LIMIT 1`,
        [reportId]
      );

    const existing =
      existingResult.rows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Report was not found."
      });
    }

    if (
      existing.report_status ===
      "APPROVED"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Approved reports cannot be edited."
      });
    }

    if (
      existing.report_status ===
      "PRINTED"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Printed reports cannot be edited."
      });
    }

    const { rows } =
      await pool.query(
        `UPDATE student_reports
         SET
          subject_marks =
            COALESCE($1,subject_marks),

          subject_grades =
            COALESCE($2,subject_grades),

          aggregate =
            COALESCE($3,aggregate),

          overall_grade =
            COALESCE($4,overall_grade),

          attendance_days =
            COALESCE($5,attendance_days),

          total_school_days =
            COALESCE($6,total_school_days),

          teacher_comment =
            COALESCE($7,teacher_comment),

          teacher_id = $8

         WHERE id = $9

         RETURNING *`,
        [
          subject_marks ?? null,
          subject_grades ?? null,
          aggregate ?? null,
          overall_grade ?? null,
          attendance_days ?? null,
          total_school_days ?? null,
          teacher_comment ?? null,
          user.id,
          reportId
        ]
      );

    return res.status(200).json({
      success: true,
      message:
        "Learner report updated successfully.",
      report: rows[0]
    });

  } catch (error) {

    console.error(
      "UPDATE STUDENT REPORT ERROR:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to update learner report."
    });
  }
});

/*
====================================================
SUBMIT REPORT
POST /api/reports/:reportId/submit
====================================================
*/

router.post(
  "/:reportId/submit",
  async (req, res) => {
    try {
      await getAuthenticatedUser(req);

      const reportId =
        req.params.reportId;

      const { rows } =
        await pool.query(
          `UPDATE student_reports
           SET
            report_status = 'SUBMITTED',
            submitted_at = NOW()
           WHERE id = $1
             AND report_status IN (
               'DRAFT',
               'RETURNED'
             )
           RETURNING *`,
          [reportId]
        );

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          message:
            "This report cannot be submitted."
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Report submitted successfully for administrator review.",
        report: rows[0]
      });

    } catch (error) {

      console.error(
        "SUBMIT REPORT ERROR:",
        error.message
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to submit report."
      });
    }
  }
);

/*
====================================================
GET SUBMITTED REPORTS
ADMIN ONLY
GET /api/reports/submitted
====================================================
*/

router.get(
  "/submitted",
  async (req, res) => {
    try {
      const user =
        await getAuthenticatedUser(req);

      if (
        String(user.role)
          .toUpperCase() !== "ADMIN"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only administrators can view submitted reports."
        });
      }

      const { rows } =
        await pool.query(
          `SELECT
            sr.*,
            s.full_name AS student_name,
            u.full_name AS teacher_name

           FROM student_reports sr

           JOIN students s
             ON s.id = sr.student_id

           JOIN users u
             ON u.id = sr.teacher_id

           WHERE sr.report_status =
             'SUBMITTED'

           ORDER BY
             sr.submitted_at DESC`
        );

      return res.status(200).json({
        success: true,
        reports: rows
      });

    } catch (error) {

      console.error(
        "GET SUBMITTED REPORTS ERROR:",
        error.message
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to retrieve submitted reports."
      });
    }
  }
);

/*
====================================================
APPROVE REPORT
ADMIN ONLY
PATCH /api/reports/:reportId/approve
====================================================
*/

router.patch(
  "/:reportId/approve",
  async (req, res) => {
    try {
      const user =
        await getAuthenticatedUser(req);

      if (
        String(user.role)
          .toUpperCase() !== "ADMIN"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only administrators can approve reports."
        });
      }

      const { rows } =
        await pool.query(
          `UPDATE student_reports
           SET
            report_status = 'APPROVED',
            approved_at = NOW(),
            approved_by = $1
           WHERE id = $2
             AND report_status =
               'SUBMITTED'
           RETURNING *`,
          [
            user.id,
            req.params.reportId
          ]
        );

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          message:
            "This report is not available for approval."
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Report approved successfully.",
        report: rows[0]
      });

    } catch (error) {

      console.error(
        "APPROVE REPORT ERROR:",
        error.message
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Unable to approve report."
      });
    }
  }
);

module.exports = router;
