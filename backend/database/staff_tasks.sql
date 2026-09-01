CREATE TABLE IF NOT EXISTS staff_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title VARCHAR(200) NOT NULL,
    description TEXT,

    assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),

    due_date TIMESTAMP NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_assigned_to
ON staff_tasks(assigned_to);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_created_by
ON staff_tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_status
ON staff_tasks(status);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_due_date
ON staff_tasks(due_date);

CREATE OR REPLACE FUNCTION update_staff_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS staff_tasks_updated_at
ON staff_tasks;

CREATE TRIGGER staff_tasks_updated_at
BEFORE UPDATE ON staff_tasks
FOR EACH ROW
EXECUTE FUNCTION update_staff_tasks_updated_at();
