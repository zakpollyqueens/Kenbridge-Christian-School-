-- ============================================================
-- KENBRIDGE CHRISTIAN SCHOOL
-- STAFF PROFILES DATABASE
-- File: database/staff_profiles.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- STAFF PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,

    employee_number VARCHAR(50) UNIQUE,

    full_name VARCHAR(200) NOT NULL,

    username VARCHAR(100),

    email VARCHAR(255),

    phone VARCHAR(50),

    alternate_phone VARCHAR(50),

    position VARCHAR(150),

    department VARCHAR(150),

    employment_type VARCHAR(30) DEFAULT 'FULL_TIME'
        CHECK (
            employment_type IN (
                'FULL_TIME',
                'PART_TIME',
                'CONTRACT',
                'TEMPORARY',
                'VOLUNTEER'
            )
        ),

    date_joined DATE,

    date_of_birth DATE,

    gender VARCHAR(20),

    address TEXT,

    profile_photo_url TEXT,

    emergency_contact_name VARCHAR(200),

    emergency_contact_phone VARCHAR(50),

    emergency_contact_relationship VARCHAR(100),

    bio TEXT,

    qualifications TEXT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id
    ON staff_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_employee_number
    ON staff_profiles(employee_number);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_department
    ON staff_profiles(department);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_position
    ON staff_profiles(position);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_active
    ON staff_profiles(is_active);

-- ============================================================
-- AUTOMATIC UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION update_staff_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS staff_profiles_updated_at
ON staff_profiles;

CREATE TRIGGER staff_profiles_updated_at
BEFORE UPDATE ON staff_profiles
FOR EACH ROW
EXECUTE FUNCTION update_staff_profiles_updated_at();

-- ============================================================
-- CREATE PROFILE FOR EXISTING STAFF USERS
-- ============================================================

INSERT INTO staff_profiles (
    user_id,
    full_name,
    username,
    email,
    position,
    department,
    is_active
)
SELECT
    u.id,
    u.full_name,
    u.username,
    u.email,
    u.position,
    u.department,
    u.is_active
FROM users u
WHERE UPPER(COALESCE(u.role, '')) IN ('STAFF', 'ADMIN')
AND NOT EXISTS (
    SELECT 1
    FROM staff_profiles sp
    WHERE sp.user_id = u.id
);

-- ============================================================
-- KEEP PROFILE INFORMATION SYNCHRONIZED
-- ============================================================

CREATE OR REPLACE FUNCTION sync_staff_profile_from_users()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO staff_profiles (
        user_id,
        full_name,
        username,
        email,
        position,
        department,
        is_active
    )
    VALUES (
        NEW.id,
        NEW.full_name,
        NEW.username,
        NEW.email,
        NEW.position,
        NEW.department,
        NEW.is_active
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        full_name = EXCLUDED.full_name,
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        position = EXCLUDED.position,
        department = EXCLUDED.department,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- ============================================================
-- USER → STAFF PROFILE TRIGGER
-- ============================================================

DROP TRIGGER IF EXISTS users_staff_profile_sync
ON users;

CREATE TRIGGER users_staff_profile_sync
AFTER INSERT OR UPDATE OF
    full_name,
    username,
    email,
    position,
    department,
    is_active
ON users
FOR EACH ROW
WHEN (
    UPPER(COALESCE(NEW.role, '')) IN ('STAFF', 'ADMIN')
)
EXECUTE FUNCTION sync_staff_profile_from_users();

-- ============================================================
-- STAFF PROFILE VIEW
-- ============================================================

CREATE OR REPLACE VIEW staff_profile_details AS
SELECT
    sp.id AS profile_id,
    sp.user_id,

    sp.employee_number,

    sp.full_name,
    sp.username,
    sp.email,
    sp.phone,
    sp.alternate_phone,

    sp.position,
    sp.department,
    sp.employment_type,

    sp.date_joined,
    sp.date_of_birth,
    sp.gender,

    sp.address,

    sp.profile_photo_url,

    sp.emergency_contact_name,
    sp.emergency_contact_phone,
    sp.emergency_contact_relationship,

    sp.bio,
    sp.qualifications,

    sp.is_active,

    sp.created_at,
    sp.updated_at,

    u.role

FROM staff_profiles sp

INNER JOIN users u
    ON u.id = sp.user_id;

-- ============================================================
-- END STAFF PROFILE DATABASE
-- ============================================================
