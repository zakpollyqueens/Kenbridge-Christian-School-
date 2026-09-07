const express = require("express");
const router = express.Router();
const pool = require("../db");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../supabase");


/* =========================================================
   ADMIN AUTHENTICATION
   ========================================================= */

async function authenticateAdmin(req, res) {
  try {
    const token =
      req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authorization token is required."
      });
      return null;
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired admin session."
      });
      return null;
    }

    const user = data.user;

    /*
      Your current database schema does not contain a public.users
      table, so we do not query users here.

      Accept an authenticated Supabase administrator when the role
      is available in either app_metadata or user_metadata.

      If no role metadata exists, the authenticated staff session is
      allowed so the existing Staff Portal session can continue
      working with the Reports API.
    */

    const role =
      user.app_metadata?.role ||
      user.user_metadata?.role ||
      user.app_metadata?.user_role ||
      user.user_metadata?.user_role ||
      "";

    if (
      role &&
      String(role).toUpperCase() !== "ADMIN"
    ) {
      res.status(403).json({
        success: false,
        message: "Administrator access is required."
      });
      return null;
    }

    return user;

  } catch (error) {

    console.error(
      "REPORTS AUTH ERROR:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to authenticate administrator."
    });

    return null;
  }
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   BUILD REPORT HTML
   ========================================================= */

function buildReportHtml({
  title,
  periodStart,
  periodEnd,
  rowsAgg
}) {

  const labels = rowsAgg.map(
    row => row.name || "Unnamed"
  );

  const avgData = rowsAgg.map(
    row => Number(row.avg_percent || 0)
  );

  const passData = rowsAgg.map(
    row => Number(row.pass_rate || 0)
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${escapeHtml(title)}</title>

<link rel="stylesheet" href="/css/style.css">

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

</head>

<body>

<div class="container">

<h1>${escapeHtml(title)}</h1>

<p>
Period:
${escapeHtml(periodStart)}
—
${escapeHtml(periodEnd)}
</p>

<section class="section">

<h3>Summary Charts</h3>

<canvas
id="avgChart"
style="max-width:900px;margin-bottom:18px"
></canvas>

<canvas
id="passChart"
style="max-width:900px;margin-bottom:28px"
></canvas>

</section>

<section class="section">

<h3>Details</h3>

<table
class="report-table"
style="width:100%;border-collapse:collapse"
>

<thead>

<tr
style="text-align:left;background:#f3f6f4"
>

<th style="padding:10px;border:1px solid #e6eee8">
Subject
</th>

<th style="padding:10px;border:1px solid #e6eee8">
Avg %
</th>

<th style="padding:10px;border:1px solid #e6eee8">
Pass %
</th>

<th style="padding:10px;border:1px solid #e6eee8">
Attempts
</th>

</tr>

</thead>

<tbody>

${rowsAgg.map(row => `

<tr>

<td style="padding:10px;border:1px solid #eef6f0">
${escapeHtml(row.name || "Unnamed")}
</td>

<td style="padding:10px;border:1px solid #eef6f0">
${Number(row.avg_percent || 0).toFixed(2)}
</td>

<td style="padding:10px;border:1px solid #eef6f0">
${Number(row.pass_rate || 0).toFixed(2)}%
</td>

<td style="padding:10px;border:1px solid #eef6f0">
${Number(row.attempts || 0)}
</td>

</tr>

`).join("")}

</tbody>

</table>

</section>

</div>

<script>

const labels = ${JSON.stringify(labels)};
const avgData = ${JSON.stringify(avgData)};
const passData = ${JSON.stringify(passData)};

new Chart(
document.getElementById("avgChart"),
{
type:"bar",

data:{
labels,

datasets:[{
label:"Average (%)",
data:avgData,
backgroundColor:"rgba(8,120,63,0.85)"
}]
},

options:{
responsive:true,

scales:{
y:{
beginAtZero:true,
max:100
}
}

}
}
);


new Chart(
document.getElementById("passChart"),
{
type:"line",

data:{
labels,

datasets:[{
label:"Pass Rate (%)",
data:passData,
borderColor:"rgba(242,140,40,0.9)",
backgroundColor:"rgba(242,140,40,0.15)",
fill:true
}]
},

options:{
responsive:true,

scales:{
y:{
beginAtZero:true,
max:100
}
}

}
}
);

</script>

</body>
</html>`;
}


/* =========================================================
   GET AVAILABLE CLASSES

   GET /api/reports/classes
   ========================================================= */

router.get("/classes", async (req, res) => {

  try {

    const admin = await authenticateAdmin(req, res);

    if (!admin) return;

    const { rows } = await pool.query(`
      SELECT DISTINCT class_name
      FROM (
        SELECT
          TRIM(class_name) AS class_name
        FROM student_reports
        WHERE class_name IS NOT NULL
          AND TRIM(class_name) <> ''

        UNION

        SELECT
          TRIM(class_name) AS class_name
        FROM reports
        WHERE class_name IS NOT NULL
          AND TRIM(class_name) <> ''

        UNION

        SELECT
          TRIM(class_name) AS class_name
        FROM report_submissions
        WHERE class_name IS NOT NULL
          AND TRIM(class_name) <> ''
      ) classes

      ORDER BY class_name ASC
    `);

    res.json({
      success: true,
      classes: rows
    });

  } catch (error) {

    console.error(
      "GET REPORT CLASSES ERROR:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to retrieve report classes."
    });
  }
});


/* =========================================================
   GET STUDENTS / REPORT STATUS FOR CLASS

   GET /api/reports/classes/:className
   ========================================================= */

router.get("/classes/:className", async (req, res) => {

  try {

    const admin = await authenticateAdmin(req, res);

    if (!admin) return;

    const className =
      String(req.params.className || "")
        .trim();

    const academicYear =
      String(req.query.academic_year || "")
        .trim();

    const term =
      String(req.query.term || "")
        .trim();

    if (!className) {
      return res.status(400).json({
        success: false,
        message: "Class name is required."
      });
    }

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: "Academic year is required."
      });
    }

    if (!term) {
      return res.status(400).json({
        success: false,
        message: "Term is required."
      });
    }


    /*
      We intentionally use the report tables rather than the
      unknown students-table structure.

      Student sources:
      1. student_reports
      2. reports
      3. report_submission_rows joined to report_submissions
    */

    const { rows } = await pool.query(`
      WITH student_source AS (

        SELECT
          sr.student_id,
          sr.class_name,
          sr.academic_year,
          sr.term,
          sr.aggregate,
          sr.overall_grade,
          sr.report_status

        FROM student_reports sr

        WHERE
          UPPER(TRIM(sr.class_name))
            = UPPER(TRIM($1))

          AND TRIM(sr.academic_year)
            = TRIM($2)

          AND TRIM(sr.term)
            = TRIM($3)


        UNION ALL


        SELECT
          r.student_id::uuid,
          r.class_name,
          r.academic_year,
          r.term,
          NULL::numeric AS aggregate,
          NULL::varchar AS overall_grade,
          r.status::text AS report_status

        FROM reports r

        WHERE
          UPPER(TRIM(r.class_name))
            = UPPER(TRIM($1))

          AND TRIM(r.academic_year)
            = TRIM($2)

          AND TRIM(r.term)
            = TRIM($3)

          AND r.student_id IS NOT NULL


        UNION ALL


        SELECT
          rr.student_id,
          rs.class_name,
          NULL::varchar AS academic_year,
          NULL::varchar AS term,
          NULL::numeric AS aggregate,
          NULL::varchar AS overall_grade,
          COALESCE(rs.status, 'NOT_STARTED')::text
            AS report_status

        FROM report_submission_rows rr

        JOIN report_submissions rs
          ON rs.id = rr.submission_id

        WHERE
          UPPER(TRIM(rs.class_name))
            = UPPER(TRIM($1))

          AND rs.period_start <= $2::date

          AND rs.period_end >= $2::date

          AND (
            rs.period_type IS NULL
            OR TRIM(rs.period_type) = TRIM($3)
            OR TRIM(rs.period_type) = TRIM($2)
          )
      ),

      deduplicated AS (

        SELECT DISTINCT ON (student_id)

          student_id,
          class_name,
          aggregate,
          overall_grade,
          report_status

        FROM student_source

        WHERE student_id IS NOT NULL

        ORDER BY
          student_id,
          report_status DESC
      )

      SELECT

        student_id,

        student_id::text AS full_name,

        class_name,

        $2 AS academic_year,

        $3 AS term,

        NULL::uuid AS report_id,

        aggregate,

        overall_grade,

        COALESCE(
          report_status,
          'NOT_STARTED'
        ) AS report_status

      FROM deduplicated

      ORDER BY student_id::text ASC
    `, [
      className,
      academicYear,
      term
    ]);

    res.json({
      success: true,
      class_name: className,
      academic_year: academicYear,
      term,
      students: rows
    });

  } catch (error) {

    console.error(
      "GET CLASS REPORT STUDENTS ERROR:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to retrieve learners for this class.",
      error: error.message
    });
  }
});


/* =========================================================
   GENERATE GENERAL ACHIEVEMENT REPORT

   POST /api/reports/generate
   ========================================================= */

router.post("/generate", async (req, res) => {

  try {

    const admin = await authenticateAdmin(req, res);

    if (!admin) return;

    const {
      periodType = "CUSTOM",
      startDate,
      endDate,
      title
    } = req.body || {};

    if (!startDate || !endDate) {

      return res.status(400).json({
        success: false,
        message:
          "startDate and endDate are required (YYYY-MM-DD)."
      });
    }


    /*
      The old implementation used:

        assessments -> competencies

      but there is no competencies table.

      The existing results table contains subject_name and marks,
      so we generate the achievement report from results instead.
    */

    const { rows } = await pool.query(`
      SELECT

        COALESCE(
          NULLIF(TRIM(subject_name), ''),
          'Unnamed Subject'
        ) AS name,

        ROUND(
          AVG(
            COALESCE(marks, 0)
          )::numeric,
          2
        ) AS avg_percent,

        COUNT(*)::INT AS attempts,

        ROUND(
          (
            SUM(
              CASE
                WHEN COALESCE(marks, 0) >= 50
                THEN 1
                ELSE 0
              END
            ) * 100.0
          ) /
          NULLIF(COUNT(*), 0),
          2
        ) AS pass_rate

      FROM results

      WHERE
        created_at::date
        BETWEEN $1::date AND $2::date

      GROUP BY
        COALESCE(
          NULLIF(TRIM(subject_name), ''),
          'Unnamed Subject'
        )

      ORDER BY
        avg_percent DESC
    `, [
      startDate,
      endDate
    ]);


    const reportTitle =
      title ||
      `Achievement Report (${periodType})`;


    const html = buildReportHtml({
      title: reportTitle,
      periodStart: startDate,
      periodEnd: endDate,
      rowsAgg: rows
    });


    const reportId = uuidv4();


    /*
      IMPORTANT:

      The actual reports table does NOT contain:
        generated_by
        summary_json

      Therefore only real columns are inserted.
    */

    await pool.query(`
      INSERT INTO reports (
        id,
        title,
        period_type,
        period_start,
        period_end,
        generated_at,
        html_content,
        status,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NOW(),
        $6,
        'GENERATED',
        NOW(),
        NOW()
      )
    `, [
      reportId,
      reportTitle,
      periodType,
      startDate,
      endDate,
      html
    ]);


    res.status(201).json({
      success: true,
      reportId,
      message: "Report generated successfully."
    });

  } catch (error) {

    console.error(
      "GENERATE REPORT ERROR:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to generate report.",
      error: error.message
    });
  }
});


/* =========================================================
   LIST GENERATED REPORTS

   GET /api/reports
   ========================================================= */

router.get("/", async (req, res) => {

  try {

    const { rows } = await pool.query(`
      SELECT
        id,
        title,
        period_type,
        period_start,
        period_end,
        generated_at,
        status,
        created_at

      FROM reports

      ORDER BY
        COALESCE(generated_at, created_at) DESC

      LIMIT 100
    `);

    res.json({
      success: true,
      reports: rows
    });

  } catch (error) {

    console.error(
      "LIST REPORTS ERROR:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to retrieve reports.",
      error: error.message
    });
  }
});


/* =========================================================
   GET ONE GENERATED REPORT

   GET /api/reports/:id

   KEEP THIS LAST.
   ========================================================= */

router.get("/:id", async (req, res) => {

  try {

    const { rows } = await pool.query(`
      SELECT
        html_content

      FROM reports

      WHERE id = $1

      LIMIT 1
    `, [
      req.params.id
    ]);


    if (!rows.length) {

      return res.status(404).send(
        "Report not found"
      );
    }


    if (!rows[0].html_content) {

      return res.status(404).send(
        "This report does not contain generated HTML."
      );
    }


    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(rows[0].html_content);

  } catch (error) {

    console.error(
      "GET REPORT ERROR:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Unable to retrieve the report.",
      error: error.message
    });
  }
});


module.exports = router;
