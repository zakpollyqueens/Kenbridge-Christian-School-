const express = require('express');
const router = express.Router();
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

// Reuse existing admin authentication pattern
const supabase = require('../supabase');

async function authenticateAdmin(req, res) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'Authorization token is required.' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ success: false, message: 'Invalid or expired admin session.' });

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [data.user.id]);
    const user = rows[0];

    if (!user) return res.status(403).json({ success: false, message: 'Administrator account was not found.' });
    if (!user.is_active || String(user.role).toUpperCase() !== 'ADMIN') return res.status(403).json({ success: false, message: 'Administrator access is required.' });

    return user;
  } catch (err) {
    console.error('REPORTS AUTH ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to authenticate administrator.' });
    return null;
  }
}

function buildReportHtml({ title, periodStart, periodEnd, rowsAgg }) {
  // Prepare data for charts
  const labels = rowsAgg.map(r => (r.name || 'Unnamed'));
  const avgData = rowsAgg.map(r => (r.avg_percent ? Number(r.avg_percent).toFixed(2) : 0));
  const passData = rowsAgg.map(r => (r.pass_rate ? Number(r.pass_rate) : 0));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="/css/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>Period: ${periodStart} — ${periodEnd}</p>

    <section class="section">
      <div class="container">
        <h3>Summary charts</h3>
        <canvas id="avgChart" style="max-width:900px;margin-bottom:18px"></canvas>
        <canvas id="passChart" style="max-width:900px;margin-bottom:28px"></canvas>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <h3>Details</h3>
        <table class="report-table" style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="text-align:left;background:#f3f6f4"><th style="padding:10px;border:1px solid #e6eee8">Competency</th><th style="padding:10px;border:1px solid #e6eee8">Avg %</th><th style="padding:10px;border:1px solid #e6eee8">Pass %</th><th style="padding:10px;border:1px solid #e6eee8">Attempts</th></tr>
          </thead>
          <tbody>
            ${rowsAgg.map(r=>`<tr><td style="padding:10px;border:1px solid #eef6f0">${r.name}</td><td style="padding:10px;border:1px solid #eef6f0">${r.avg_percent?Number(r.avg_percent).toFixed(2):'N/A'}</td><td style="padding:10px;border:1px solid #eef6f0">${r.pass_rate||0}%</td><td style="padding:10px;border:1px solid #eef6f0">${r.attempts||0}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

  </div>

  <script>
    const labels = ${JSON.stringify(labels)};
    const avgData = ${JSON.stringify(avgData.map(n=>Number(n)))};
    const passData = ${JSON.stringify(passData.map(n=>Number(n)))};

    // Average percentage bar chart
    const ctx = document.getElementById('avgChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Average (%)',
          data: avgData,
          backgroundColor: 'rgba(8,120,63,0.85)'
        }]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });

    // Pass rate line chart
    const ctx2 = document.getElementById('passChart').getContext('2d');
    new Chart(ctx2, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Pass Rate (%)',
          data: passData,
          borderColor: 'rgba(242,140,40,0.9)',
          backgroundColor: 'rgba(242,140,40,0.15)',
          fill: true,
        }]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  </script>
</body>
</html>`;
}

router.post('/generate', async (req, res) => {
  try {
    const admin = await authenticateAdmin(req, res);
    if (!admin) return;

    const { periodType = 'CUSTOM', startDate, endDate, title } = req.body || {};
    if (!startDate || !endDate) return res.status(400).json({ success: false, message: 'startDate and endDate are required (YYYY-MM-DD).' });

    const periodStart = startDate;
    const periodEnd = endDate;

    const { rows } = await pool.query(`
      SELECT c.id, c.name,
        AVG( (a.score / NULLIF(a.max_score,0)) * 100 ) AS avg_percent,
        COUNT(*)::INT AS attempts,
        ROUND( SUM( CASE WHEN (a.score / NULLIF(a.max_score,0)) * 100 >= 50 THEN 1 ELSE 0 END) *100.0/NULLIF(COUNT(*),0)::numeric,2) AS pass_rate
      FROM assessments a
      JOIN competencies c ON c.id = a.competency_id
      WHERE a.assessment_date BETWEEN $1 AND $2
      GROUP BY c.id, c.name
      ORDER BY avg_percent DESC
    `, [periodStart, periodEnd]);

    const html = buildReportHtml({ title: title || `Achievement Report (${periodType})`, periodStart, periodEnd, rowsAgg: rows });
    const reportId = uuidv4();

    await pool.query(`INSERT INTO reports (id, period_type, period_start, period_end, generated_by, generated_at, title, html_content, summary_json) VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8)`, [reportId, periodType, periodStart, periodEnd, admin.id, title || null, html, JSON.stringify({ count: rows.length })]);

    res.status(201).json({ success: true, reportId });
  } catch (err) {
    console.error('GENERATE REPORT ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to generate report.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, title, period_type, period_start, period_end, generated_at FROM reports ORDER BY generated_at DESC LIMIT 100');
    res.json({ success: true, reports: rows });
  } catch (err) {
    console.error('LIST REPORTS ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to retrieve reports.' });
  }
});

router.get('/:id', async (req,res) => {
  try {
    const { rows } = await pool.query('SELECT html_content FROM reports WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).send('Report not found');
    res.set('Content-Type','text/html').send(rows[0].html_content);
  } catch (err) {
    console.error('GET REPORT ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to retrieve the report.' });
  }
});

module.exports = router;
