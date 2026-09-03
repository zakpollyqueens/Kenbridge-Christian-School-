-- Seed sample competencies and assessments for testing
-- Run this after creating the tables

INSERT INTO competencies (id, code, name, description)
VALUES
  (gen_random_uuid(), 'NUM_LIT', 'Numeracy & Literacy', 'Basic numeracy and literacy skills'),
  (gen_random_uuid(), 'SCI', 'Science Fundamentals', 'Basic science concepts'),
  (gen_random_uuid(), 'COMM', 'Communication', 'Oral and written communication skills')
RETURNING id;

-- Insert sample assessments (student_id can be any uuid since there is no FK to users in this schema)
INSERT INTO assessments (student_id, competency_id, score, max_score, assessment_date, assessment_type, notes)
SELECT
  gen_random_uuid() as student_id,
  c.id,
  (50 + (random()*50))::numeric(5,2) as score,
  100,
  (current_date - (trunc(random()*30)))::date as assessment_date,
  'quiz',
  'Sample seed data'
FROM competencies c
CROSS JOIN generate_series(1,8) gs;
