-- Update the 'admins' table
ALTER TABLE IF EXISTS admins 
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
    
-- Update the 'visa_applications' table to match the updated requirements
ALTER TABLE IF EXISTS visa_applications 
    ADD COLUMN IF NOT EXISTS passport_number TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS nationality TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS visa_type TEXT NOT NULL,
    ADD COLUMN IF NOT EXISTS trn TEXT UNIQUE NOT NULL,
    ADD COLUMN IF NOT EXISTS browser_token TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS locked_at DATETIME DEFAULT NULL;

-- Update the audit_logs with dependent action data (if needed)
ALTER TABLE IF EXISTS audit_logs
    ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Create a separate table for browser tokens
CREATE TABLE IF NOT EXISTS browser_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_primary BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- Create a table for admin activity logs
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id)
);