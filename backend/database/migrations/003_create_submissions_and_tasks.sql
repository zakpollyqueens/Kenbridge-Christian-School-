-- Create submissions, submission rows, tasks, audit logs, classes, students and mappings
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Minimal students table (if not present)
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  admission_number text,
  class text,
  created_at timestamptz DEFAULT now()
);

-- Class roster mapping
CREATE TABLE IF NOT EXISTS class_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name text NOT NULL,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE
);

-- Map class to staff (staff-in-charge)
CREATE TABLE IF NOT EXISTS class_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_name text NOT NULL,
  staff_id uuid NOT NULL -- references users.id (optional)
);

-- Report submissions
CREATE TABLE IF NOT EXISTS report_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  class_name text,
  period_type text NOT NULL,
  period_start date,
  period_end date,
  submitted_by uuid,
  submitted_at timestamptz DEFAULT now(),
  status text DEFAULT 'draft', -- draft, pending, approved, published, rejected
  html_content text,
  json_content jsonb,
  pdf_url text,
  assigned_to uuid,
  created_at timestamptz DEFAULT now()
);

-- Rows for each submission (student-level)
CREATE TABLE IF NOT EXISTS report_submission_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  student_id uuid,
  student_name text,
  marks jsonb,
  competencies jsonb,
  comments text
);

-- Tasks assigned to staff for printing/publishing
CREATE TABLE IF NOT EXISTS report_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  assigned_to uuid,
  role_needed text,
  status text DEFAULT 'open', -- open, in_progress, completed
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- Audit log
CREATE TABLE IF NOT EXISTS report_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES report_submissions(id) ON DELETE CASCADE,
  action text NOT NULL,
  by_user uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);
