-- Add parent_email to students table for notifications
ALTER TABLE IF EXISTS students
  ADD COLUMN IF NOT EXISTS parent_email text;
