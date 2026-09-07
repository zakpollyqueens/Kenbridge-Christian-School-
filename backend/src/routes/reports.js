const express = require("express");
const router = express.Router();
const pool = require("../db");
const supabase = require("../supabase");
const { v4: uuidv4 } = require("uuid");

async function authenticateAdmin(req, res) {
  try {
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      res.status(401).json({ success: false, message: "Authorization token is required." });
      return null;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ success: false, message: "Invalid or expired admin session." });
      return null;
    }

    const user = data.user;
    const role =
      user.app_metadata?.role ||
      user.user_metadata?.role ||
      user.app_metadata?.user_role ||
      user.user_metadata?.user_role ||
      "";

    if (role && String(role).toUpperCase() !== "ADMIN") {
      res.status(403).json({ success: false, message: "Administrator access is required." });
      return null;
    }

    return user;
  } catch (error) {
    console.error("REPORTS AUTH ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to authenticate administrator." });
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildReportHtml({ title, periodStart, periodEnd, rowsAgg }) {
  const labels = rowsAgg.map(row => row.name || "Unnamed");
  const avgData = rowsAgg.map(row => Number(row.avg_percent || 0));
  const passData = rowsAgg.map(row => Number(row.pass_rate || 0));

  const detailRows = rowsAgg.map(row => `
<tr>
<td>${escapeHtml(row.name || "Unnamed")}</td>
<td>${Number(row.avg_percent || 0).toFixed(2)}</td>
<td>${Number(row.pass_rate || 0).toFixed(2)}%</td>
<td>${Number(row.attempts || 0)}</td>
</tr>`).join("");

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
<p>Period: ${escapeHtml(periodStart)} — ${escapeHtml(periodEnd)}</p>

<section class="section">
<h3>Summary Charts</h3>
<canvas id="avgChart"></canvas>
<canvas id="passChart"></canvas>
</section>

<section class="section">
<h3>Details</h3>
<table class="report-table">
<thead><tr><th>Subject</th><th>Avg %</th><th>Pass %</th><th>Attempts</th></tr></thead>
<tbody>${detailRows}</tbody>
</table>
</section>
</div>

<script>
const labels = ${JSON.stringify(labels)};
const avgData = ${JSON.stringify(avgData)};
const passData = ${JSON.stringify(passData)};

new Chart(document.getElementById("avgChart"), {
  type: "bar",
  data: { labels, datasets: [{
    label: "Average (%)",
    data: avgData,
    backgroundColor: "rgba(8,120,63,0.85)"
  }]},
  options: { scales: { y: { beginAtZero: true, max: 100 }}}
});

new Chart(document.getElementById("passChart"), {
  type: "line",
  data: { labels, datasets: [{
    label: "Pass Rate (%)",
    data: passData,
    borderColor: "rgba(242,140,40,0.9)",
    backgroundColor: "rgba(242,140,40,0.15)",
    fill: true
  }]},
  options: { scales: { y: { beginAtZero: true, max: 100 }}}
});
</script>
</body>
</html>`;
}

router.get("/classes", async (req, res) => {
  try {
    if (!await authenticateAdmin(req, res)) return;

    const { rows } = await pool.query(`
      SELECT DISTINCT TRIM(class_name) AS class_name
      FROM (
        SELECT class_name FROM student_reports
        UNION
        SELECT class_name FROM reports
        UNION
        SELECT class_name FROM report_submissions
      ) AS available_classes
      WHERE class_name IS NOT NULL AND TRIM(class_name) <> ''
      ORDER BY class_name ASC
    `);

    res.json({ success: true, classes: rows });
  } catch (error) {
    console.error("GET REPORT CLASSES ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve report classes.",
      error: error.message
    });
  }
});

router.get("/classes/:className", async (req, res) => {
  try {
    if (!await authenticateAdmin(req, res)) return;

    const className = String(req.params.className || "").trim();
    const academicYear = String(req.query.academic_year || "").trim();
    const term = String(req.query.term || "").trim();

    if (!className) return res.status(400).json({ success: false, message: "Class name is required." });
    if (!academicYear) return res.status(400).json({ success: false, message: "Academic year is required." });
    if (!term) return res.status(400).json({ success: false, message: "Term is required." });

    const { rows } = await pool.query(`
      WITH learner_data AS (
        SELECT sr.student_id,
          MAX(NULLIF(TRIM(rr.student_name), '')) AS student_name,
          MAX(sr.class_name) AS class_name,
          MAX(sr.aggregate) AS aggregate,
          MAX(sr.overall_grade) AS overall_grade,
          MAX(sr.report_status::text) AS report_status
        FROM student_reports sr
        LEFT JOIN report_submissions rs
          ON UPPER(TRIM(rs.class_name)) = UPPER(TRIM(sr.class_name))
          AND rs.period_start <= CURRENT_DATE
          AND rs.period_end >= CURRENT_DATE
        LEFT JOIN report_submission_rows rr
          ON rr.submission_id = rs.id AND rr.student_id = sr.student_id
        WHERE UPPER(TRIM(sr.class_name)) = UPPER(TRIM($1))
          AND TRIM(sr.academic_year) = TRIM($2)
          AND TRIM(sr.term) = TRIM($3)
        GROUP BY sr.student_id
      ),
      generated_reports AS (
        SELECT r.student_id, MAX(r.id::text) AS report_id
        FROM reports r
        WHERE UPPER(TRIM(r.class_name)) = UPPER(TRIM($1))
          AND TRIM(r.academic_year) = TRIM($2)
          AND TRIM(r.term) = TRIM($3)
        GROUP BY r.student_id
      )
      SELECT ld.student_id,
        COALESCE(ld.student_name, 'Student ' || ld.student_id::text) AS full_name,
        ld.class_name, $2 AS academic_year, $3 AS term,
        gr.report_id, ld.aggregate, ld.overall_grade,
        COALESCE(ld.report_status, 'NOT_STARTED') AS report_status
      FROM learner_data ld
      LEFT JOIN generated_reports gr ON gr.student_id::text = ld.student_id::text
      ORDER BY full_name ASC
    `, [className, academicYear, term]);

    res.json({ success: true, class_name: className, academic_year: academicYear, term, students: rows });
  } catch (error) {
    console.error("GET CLASS REPORT STUDENTS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve learners for this class.",
      error: error.message
    });
  }
});

router.post("/generate", async (req, res) => {
  try {
    if (!await authenticateAdmin(req, res)) return;

    const { periodType = "CUSTOM", startDate, endDate, title } = req.body || {};
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required (YYYY-MM-DD)."
      });
    }

    const { rows } = await pool.query(`
      SELECT COALESCE(NULLIF(TRIM(subject_name), ''), 'Unnamed Subject') AS name,
        ROUND(AVG(COALESCE(marks, 0))::numeric, 2) AS avg_percent,
        COUNT(*)::integer AS attempts,
        ROUND(SUM(CASE WHEN COALESCE(marks, 0) >= 50 THEN 1 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(*), 0), 2) AS pass_rate
      FROM results
      WHERE created_at::date BETWEEN $1::date AND $2::date
      GROUP BY COALESCE(NULLIF(TRIM(subject_name), ''), 'Unnamed Subject')
      ORDER BY avg_percent DESC
    `, [startDate, endDate]);

    const reportTitle = title || `Achievement Report (${periodType})`;
    const reportId = uuidv4();

    await pool.query(`
      INSERT INTO reports (
        id, title, period_type, period_start, period_end,
        generated_at, html_content, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), NOW())
    `, [
      reportId,
      reportTitle,
      periodType,
      startDate,
      endDate,
      buildReportHtml({ title: reportTitle, periodStart: startDate, periodEnd: endDate, rowsAgg: rows })
    ]);

    res.status(201).json({
      success: true,
      reportId,
      message: "Report generated successfully."
    });
  } catch (error) {
    console.error("GENERATE REPORT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to generate report.",
      error: error.message
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, period_type, period_start, period_end,
        generated_at, created_at, updated_at
      FROM reports
      ORDER BY COALESCE(generated_at, created_at) DESC
      LIMIT 100
    `);

    res.json({ success: true, reports: rows });
  } catch (error) {
    console.error("LIST REPORTS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve reports.",
      error: error.message
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT html_content FROM reports WHERE id = $1 LIMIT 1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).send("Report not found");
    if (!rows[0].html_content) {
      return res.status(404).send("This report does not contain generated HTML.");
    }

    res.status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(rows[0].html_content);
  } catch (error) {
    console.error("GET REPORT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve the report.",
      error: error.message
    });
  }
});

module.exports = router;
