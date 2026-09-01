CREATE TABLE IF NOT EXISTS student_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    class_name VARCHAR(50) NOT NULL,

    academic_year VARCHAR(20) NOT NULL,
    term VARCHAR(20) NOT NULL,

    subject_marks JSONB NOT NULL DEFAULT '{}'::jsonb,
    subject_grades JSONB NOT NULL DEFAULT '{}'::jsonb,

    aggregate NUMERIC(10,2),
    overall_grade VARCHAR(20),

    attendance_days INTEGER DEFAULT 0,
    total_school_days INTEGER DEFAULT 0,

    teacher_comment TEXT,
    head_teacher_comment TEXT,

    report_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT student_reports_status_check
        CHECK (
            report_status IN (
                'DRAFT',
                'SUBMITTED',
                'APPROVED',
                'PRINTED',
                'RETURNED'
            )
        ),

    CONSTRAINT unique_student_report
        UNIQUE (
            student_id,
            academic_year,
            term
        )
);

CREATE INDEX IF NOT EXISTS idx_student_reports_student
ON student_reports(student_id);

CREATE INDEX IF NOT EXISTS idx_student_reports_teacher
ON student_reports(teacher_id);

CREATE INDEX IF NOT EXISTS idx_student_reports_class
ON student_reports(class_name);

CREATE INDEX IF NOT EXISTS idx_student_reports_status
ON student_reports(report_status);

CREATE OR REPLACE FUNCTION update_student_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_reports_updated_at
ON student_reports;

CREATE TRIGGER student_reports_updated_at
BEFORE UPDATE ON student_reports
FOR EACH ROW
EXECUTE FUNCTION update_student_reports_updated_at();
