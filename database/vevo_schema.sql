-- Complete VEVO Schema

-- Admin Users Table
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    visa_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_id) REFERENCES admins(id),
    FOREIGN KEY(visa_id) REFERENCES visa_applications(id)
);