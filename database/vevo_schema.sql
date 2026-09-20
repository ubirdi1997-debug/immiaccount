-- Complete VEVO Schema

-- Admin Users Table with Browser Locking and Super Admin
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    is_super_admin BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    -- Browser/Machine Locking Fields
    browser_fingerprint TEXT DEFAULT NULL,
    machine_token TEXT DEFAULT NULL,
    locked_at DATETIME DEFAULT NULL,
    last_login_ip TEXT DEFAULT NULL,
    last_login_at DATETIME DEFAULT NULL,
    last_user_agent TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin Login Attempts Table (for tracking failed logins)
CREATE TABLE IF NOT EXISTS admin_login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    attempted_username TEXT,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    browser_fingerprint TEXT,
    success BOOLEAN DEFAULT FALSE,
    reason TEXT,
    attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES admins(id)
);

-- Admin Session Tokens Table (for tracking active sessions)
CREATE TABLE IF NOT EXISTS admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    browser_fingerprint TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(admin_id) REFERENCES admins(id)
);

-- Admin Machine Locks Table (for tracking machine locks)
CREATE TABLE IF NOT EXISTS admin_machine_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    machine_token TEXT NOT NULL UNIQUE,
    browser_fingerprint TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    user_agent TEXT,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY(admin_id) REFERENCES admins(id)
);

-- Comprehensive VEVO Visa Records Table
CREATE TABLE IF NOT EXISTS visa_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Verification Query Keys (Used by applicant to query VEVO)
    reference_type TEXT CHECK(reference_type IN ('TRN', 'Grant Number', 'Evidence Number', 'Password')) NOT NULL DEFAULT 'TRN',
    reference_number TEXT NOT NULL UNIQUE,
    passport_number TEXT NOT NULL,
    country_of_passport TEXT NOT NULL,
    date_of_birth TEXT NOT NULL, -- Format: DD/MM/YYYY
    
    -- Applicant Details
    given_names TEXT NOT NULL,
    family_name TEXT NOT NULL,
    
    -- Official VEVO Display Fields
    visa_class_subclass TEXT NOT NULL, -- e.g., "Student (subclass 500)"
    visa_description TEXT NOT NULL,    -- e.g., "Higher Education Sector"
    visa_applicant_status TEXT DEFAULT 'Primary', -- "Primary" or "Secondary"
    visa_status TEXT CHECK(visa_status IN ('In Progress', 'Approved', 'Rejected', 'In Effect', 'Not In Effect', 'Cancelled')) NOT NULL DEFAULT 'In Progress',
    
    -- Dates & Validity
    grant_date TEXT,          -- Format: DD Month YYYY (e.g., 15 January 2025)
    expiry_date TEXT,         -- Format: DD Month YYYY
    must_not_arrive_after TEXT,
    period_of_stay TEXT DEFAULT 'Until Visa Expiry',
    entries_allowed TEXT DEFAULT 'Multiple',
    location_at_grant TEXT DEFAULT 'Offshore',
    
    -- Entitlements & Work/Study Conditions (Stored as JSON array)
    work_entitlements TEXT DEFAULT '["8105 - Work limitation (48 hours per fortnight during study session)"]',
    study_entitlements TEXT DEFAULT '["8202 - Meet course requirements"]',
    other_conditions TEXT DEFAULT '["8501 - Maintain adequate health insurance"]',
    
    -- System Audit Metadata
    internal_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System Audit History Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    visa_id INTEGER DEFAULT NULL,  -- Nullable for admin-only actions like LOGIN, LOGOUT, etc.
    action TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES admins(id),
    FOREIGN KEY(visa_id) REFERENCES visa_applications(id) ON DELETE SET NULL
);