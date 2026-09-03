const express = require('express');
const router = express.Router();
const pool = require('../db');
const supabase = require('../supabase');
const { v4: uuidv4 } = require('uuid');
const pdfUtil = require('../utils/pdf');
const storage = require('../utils/storage-s3');
const emailUtil = require('../utils/email');

async function getUserFromToken(req, res) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, message: 'Authorization token is required.' });
      return null;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ success: false, message: 'Invalid or expired session.' });
      return null;
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [data.user.id]);
    const user = rows[0];
    if (!user) {
      res.status(403).json({ success: false, message: 'User account not found.' });
      return null;
    }

    return user;
  } catch (err) {
    console.error('AUTH ERROR:', err);
    res.status(500).json({ success: false, message: 'Authentication failed.' });
    return null;
  }
}

// Teacher creates a submission (can include json_content or csv string)
router.post('/', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;

    const { title, class_name, period_type, period_start, period_end, json_content, csv } = req.body || {};
    if (!period_type || !period_start || !period_end) return res.status(400).json({ success: false, message: 'Period type, start and end dates are required.' });

    // Parse CSV if provided (simple parser)
    let parsedRows = [];
    if (csv) {
      const lines = csv.split(/\r?\n/).filter(Boolean);
      const headers = lines.shift().split(',').map(h=>h.trim());
      for (const line of lines) {
        const parts = line.split(',').map(p=>p.trim());
        const obj = {};
        for (let i=0;i<headers.length;i++) obj[headers[i]] = parts[i] ?? null;
        parsedRows.push(obj);
      }
    }

    const submissionId = uuidv4();
    const jsonContent = json_content || (parsedRows.length ? { rows: parsedRows } : null);

    const insert = await pool.query(`INSERT INTO report_submissions (id, title, class_name, period_type, period_start, period_end, submitted_by, submitted_at, status, json_content) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'pending',$8) RETURNING *`, [submissionId, title||null, class_name||null, period_type, period_start, period_end, user.id, jsonContent]);

    // Insert rows
    if (jsonContent?.rows && Array.isArray(jsonContent.rows)) {
      for (const r of jsonContent.rows) {
        await pool.query(`INSERT INTO report_submission_rows (submission_id, student_name, marks, competencies, comments) VALUES ($1,$2,$3,$4,$5)`, [submissionId, r['student_name'] || r['name'] || null, JSON.stringify(r), null, r['comments']||null]);
      }
    }

    // Auto-assign to class_staff if exists
    let assignedTo = null;
    if (class_name) {
      const { rows } = await pool.query('SELECT staff_id FROM class_staff WHERE class_name = $1 LIMIT 1', [class_name]);
      if (rows.length) {
        assignedTo = rows[0].staff_id;
      }
    }

    // Create task for secretariat (role SECRETARIAT)
    const taskId = uuidv4();
    await pool.query('INSERT INTO report_tasks (id, submission_id, assigned_to, role_needed, status, created_at) VALUES ($1,$2,$3,$4,$5,NOW())', [taskId, submissionId, assignedTo, 'SECRETARIAT', 'open']);

    // Create audit log
    await pool.query('INSERT INTO report_audit_logs (submission_id, action, by_user, notes) VALUES ($1,$2,$3,$4)', [submissionId, 'submitted', user.id, 'Submitted by teacher']);

    // Send notification record to staff notifications table if assigned
    if (assignedTo) {
      await pool.query("INSERT INTO staff_notifications (user_id, title, message, type, is_read, created_at) VALUES ($1,$2,$3,$4,FALSE,NOW())", [assignedTo, 'New report submitted', `A new ${period_type} report was submitted for ${class_name || 'a class'}.`, 'REPORT']);
    }

    res.status(201).json({ success: true, submission: insert.rows[0], taskId });
  } catch (err) {
    console.error('CREATE SUBMISSION ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to create submission.' });
  }
});

// List submissions or tasks for user
router.get('/', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;

    // Teachers: their submissions. Staff: tasks assigned to them or role-based
    if (String(user.role).toUpperCase() === 'TEACHER') {
      const { rows } = await pool.query('SELECT * FROM report_submissions WHERE submitted_by = $1 ORDER BY submitted_at DESC', [user.id]);
      return res.json({ success: true, submissions: rows });
    }

    // Staff/secretariat/finance/admin
    const { rows } = await pool.query('SELECT t.*, s.title, s.class_name, s.period_type, s.status, t.submission_id FROM report_tasks t JOIN report_submissions s ON s.id = t.submission_id WHERE t.assigned_to = $1 OR $2 = ANY(ARRAY[\'ADMIN\', t.role_needed]) ORDER BY t.created_at DESC', [user.id, String(user.role).toUpperCase()]);
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error('LIST SUBMISSIONS ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to retrieve submissions.' });
  }
});

// Get submission details
router.get('/:id', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;

    const { rows } = await pool.query('SELECT * FROM report_submissions WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Submission not found.' });
    const submission = rows[0];

    const { rows: rowItems } = await pool.query('SELECT * FROM report_submission_rows WHERE submission_id = $1', [req.params.id]);

    res.json({ success: true, submission: submission, rows: rowItems });
  } catch (err) {
    console.error('GET SUBMISSION ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to retrieve submission.' });
  }
});

// Assign task to a staff member
router.post('/:id/assign', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;
    if (!['ADMIN','SECRETARIAT','FINANCE'].includes(String(user.role).toUpperCase())) return res.status(403).json({ success: false, message: 'Permission denied.' });

    const { assigned_to } = req.body || {};
    if (!assigned_to) return res.status(400).json({ success: false, message: 'assigned_to is required.' });

    await pool.query('UPDATE report_tasks SET assigned_to = $1, updated_at = NOW() WHERE submission_id = $2', [assigned_to, req.params.id]);
    await pool.query('UPDATE report_submissions SET assigned_to = $1 WHERE id = $2', [assigned_to, req.params.id]);
    await pool.query('INSERT INTO report_audit_logs (submission_id, action, by_user, notes) VALUES ($1,$2,$3,$4)', [req.params.id, 'assigned', user.id, `Assigned to ${assigned_to}`]);

    // notify
    await pool.query("INSERT INTO staff_notifications (user_id, title, message, type, is_read, created_at) VALUES ($1,$2,$3,$4,FALSE,NOW())", [assigned_to, 'Report assigned', `A report requires your attention.`, 'REPORT']);

    res.json({ success: true, message: 'Assigned.' });
  } catch (err) {
    console.error('ASSIGN ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to assign.' });
  }
});

// Approve submission
router.post('/:id/approve', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;
    // only staff roles
    if (!['ADMIN','SECRETARIAT','FINANCE'].includes(String(user.role).toUpperCase())) return res.status(403).json({ success: false, message: 'Permission denied.' });

    // Update submission to approved and create audit log
    await pool.query('UPDATE report_submissions SET status = $1 WHERE id = $2', ['approved', req.params.id]);
    await pool.query('UPDATE report_tasks SET status = $1, updated_at = NOW() WHERE submission_id = $2', ['completed', req.params.id]);
    await pool.query('INSERT INTO report_audit_logs (submission_id, action, by_user, notes) VALUES ($1,$2,$3,$4)', [req.params.id, 'approved', user.id, req.body?.notes || null]);

    // Generate PDF and store link (async)
    try {
      const { rows } = await pool.query('SELECT html_content, json_content, title FROM report_submissions WHERE id = $1 LIMIT 1', [req.params.id]);
      const submission = rows[0];
      // If html_content is null, render a simple template from json_content using reports route builder
      let html = submission.html_content;
      if (!html && submission.json_content) {
        // build a basic HTML view
        html = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"></head><body><div class="container"><h1>${submission.title||'Report'}</h1><pre>${JSON.stringify(submission.json_content, null, 2)}</pre></div></body></html>`;
      }
      const pdfBuffer = await pdfUtil.renderPdfFromHtml(html);

      let finalUrl = null;
      if (storage.isConfigured()) {
        const key = `reports/${req.params.id}.pdf`;
        await storage.uploadBufferToS3(pdfBuffer, key, 'application/pdf');
        if (storage.PUBLIC) {
          finalUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.S3_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
        } else {
          // generate signed url for 7 days (default)
          const expires = Number(process.env.SIGNED_URL_EXPIRE_SECONDS) || 7*24*3600;
          finalUrl = await storage.generateSignedUrl(key, expires);
        }
        await pool.query('UPDATE report_submissions SET pdf_url = $1, status = $2 WHERE id = $3', [finalUrl, 'published', req.params.id]);
      } else {
        // fallback: store base64 (not ideal)
        const base64 = pdfBuffer.toString('base64');
        const pdfDataUrl = `data:application/pdf;base64,${base64}`;
        finalUrl = pdfDataUrl;
        await pool.query('UPDATE report_submissions SET pdf_url = $1, status = $2 WHERE id = $3', [pdfDataUrl, 'published', req.params.id]);
      }

      // Send notification emails to parents if emails exist
      try {
        // gather parent emails from students table where student_name matches (best-effort)
        const { rows: rowItems } = await pool.query('SELECT * FROM report_submission_rows WHERE submission_id = $1', [req.params.id]);
        const emails = new Set();
        for (const r of rowItems) {
          if (r.student_id) {
            const { rows: srows } = await pool.query('SELECT parent_email FROM students WHERE id = $1 LIMIT 1', [r.student_id]);
            if (srows.length && srows[0].parent_email) emails.add(srows[0].parent_email);
          }
          if (r.student_name) {
            const { rows: srows } = await pool.query('SELECT parent_email FROM students WHERE full_name = $1 LIMIT 1', [r.student_name]);
            if (srows.length && srows[0].parent_email) emails.add(srows[0].parent_email);
          }
        }

        // also include submitter and assigned staff
        const { rows: subinfo } = await pool.query('SELECT submitted_by, assigned_to, class_name, title FROM report_submissions WHERE id = $1 LIMIT 1', [req.params.id]);
        const sub = subinfo[0];
        if (sub.submitted_by) {
          const { rows: u } = await pool.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [sub.submitted_by]);
          if (u.length && u[0].email) emails.add(u[0].email);
        }
        if (sub.assigned_to) {
          const { rows: u2 } = await pool.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [sub.assigned_to]);
          if (u2.length && u2[0].email) emails.add(u2[0].email);
        }

        if (emails.size) {
          const recipients = Array.from(emails);
          const subject = `Published report: ${sub.title || 'Class Report'}`;
          const text = `A report for ${sub.class_name || ''} has been published. View or download: ${finalUrl}`;
          const html = `<p>A report for <strong>${sub.class_name || ''}</strong> has been published.</p><p><a href="${finalUrl}">Download the report</a></p>`;
          await emailUtil.sendMail(recipients, subject, text, html);
        }
      } catch (emailErr) {
        console.error('EMAIL SEND ERROR:', emailErr);
      }

    } catch (pdfErr) {
      console.error('PDF GENERATION FAILED:', pdfErr);
    }

    res.json({ success: true, message: 'Approved and published.' });
  } catch (err) {
    console.error('APPROVE ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to approve.' });
  }
});

// Reject submission (send back)
router.post('/:id/reject', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;
    if (!['ADMIN','SECRETARIAT','FINANCE'].includes(String(user.role).toUpperCase())) return res.status(403).json({ success: false, message: 'Permission denied.' });

    const { notes } = req.body || {};
    await pool.query('UPDATE report_submissions SET status = $1 WHERE id = $2', ['rejected', req.params.id]);
    await pool.query('INSERT INTO report_audit_logs (submission_id, action, by_user, notes) VALUES ($1,$2,$3,$4)', [req.params.id, 'rejected', user.id, notes || null]);

    // notify submitter
    const { rows } = await pool.query('SELECT submitted_by FROM report_submissions WHERE id = $1 LIMIT 1', [req.params.id]);
    if (rows.length && rows[0].submitted_by) {
      await pool.query("INSERT INTO staff_notifications (user_id, title, message, type, is_read, created_at) VALUES ($1,$2,$3,$4,FALSE,NOW())", [rows[0].submitted_by, 'Report rejected', `Your report requires changes: ${notes||''}`, 'REPORT']);
    }

    res.json({ success: true, message: 'Rejected.' });
  } catch (err) {
    console.error('REJECT ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to reject.' });
  }
});

// Export PDF (stream)
router.get('/:id/export/pdf', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;

    const { rows } = await pool.query('SELECT html_content, json_content, title, pdf_url FROM report_submissions WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    const submission = rows[0];

    if (submission.pdf_url && submission.pdf_url.startsWith('data:')) {
      // send data URL
      const base64 = submission.pdf_url.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');
      res.set('Content-Type','application/pdf');
      res.set('Content-Disposition', `attachment; filename="${(submission.title||'report').replace(/[^a-z0-9\-_\.]/gi,'_')}.pdf"`);
      res.send(buffer);
      return;
    }

    // If pdf_url is an S3 link (public or signed), redirect
    if (submission.pdf_url) {
      return res.redirect(submission.pdf_url);
    }

    let html = submission.html_content;
    if (!html && submission.json_content) {
      html = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"></head><body><div class="container"><h1>${submission.title||'Report'}</h1><pre>${JSON.stringify(submission.json_content, null, 2)}</pre></div></body></html>`;
    }

    const pdfBuffer = await pdfUtil.renderPdfFromHtml(html);
    res.set('Content-Type','application/pdf');
    res.set('Content-Disposition', `attachment; filename="${(submission.title||'report').replace(/[^a-z0-9\-_\.]/gi,'_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('EXPORT PDF ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to export PDF.' });
  }
});

// Generate signed URL for a submission's PDF (if S3 private)
router.get('/:id/signed-url', async (req, res) => {
  try {
    const user = await getUserFromToken(req, res);
    if (!user) return;
    if (!storage.isConfigured()) return res.status(400).json({ success: false, message: 'Storage not configured.' });

    const expires = Number(req.query.expires) || Number(process.env.SIGNED_URL_EXPIRE_SECONDS) || 7*24*3600;
    const { rows } = await pool.query('SELECT pdf_url FROM report_submissions WHERE id = $1 LIMIT 1', [req.params.id]);
    if (!rows.length || !rows[0].pdf_url) return res.status(404).json({ success: false, message: 'PDF not found.' });
    const pdfUrl = rows[0].pdf_url;

    // if pdfUrl is s3 public link, return it
    if (pdfUrl.startsWith('http')) return res.json({ success: true, url: pdfUrl });

    // If stored key (we stored key earlier when uploading), we need the key. We stored key as reports/<id>.pdf
    const key = `reports/${req.params.id}.pdf`;
    const signed = await storage.generateSignedUrl(key, expires);
    res.json({ success: true, url: signed });
  } catch (err) {
    console.error('SIGNED URL ERROR:', err);
    res.status(500).json({ success: false, message: 'Unable to generate signed URL.' });
  }
});

module.exports = router;
