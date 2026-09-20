// SQLite Database for VEVO System
import Database from 'better-sqlite3';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, 'data/app.db');

// Ensure data directory exists
if (!existsSync(dirname(DB_PATH))) {
  mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
export function initDatabase() {
  // Admin Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Comprehensive VEVO Visa Records Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS visa_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Verification Query Keys
      reference_type TEXT CHECK(reference_type IN ('TRN', 'Grant Number', 'Evidence Number', 'Password')) NOT NULL DEFAULT 'TRN',
      reference_number TEXT NOT NULL UNIQUE,
      passport_number TEXT NOT NULL,
      country_of_passport TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      
      -- Applicant Details
      given_names TEXT NOT NULL,
      family_name TEXT NOT NULL,
      
      -- Official VEVO Display Fields
      visa_class_subclass TEXT NOT NULL,
      visa_description TEXT NOT NULL,
      visa_applicant_status TEXT DEFAULT 'Primary',
      visa_status TEXT CHECK(visa_status IN ('In Progress', 'Approved', 'Rejected', 'In Effect', 'Not In Effect', 'Cancelled')) NOT NULL DEFAULT 'In Progress',
      
      -- Dates & Validity
      grant_date TEXT,
      expiry_date TEXT,
      must_not_arrive_after TEXT,
      period_of_stay TEXT DEFAULT 'Until Visa Expiry',
      entries_allowed TEXT DEFAULT 'Multiple',
      location_at_grant TEXT DEFAULT 'Offshore',
      
      -- Entitlements & Conditions (JSON arrays)
      work_entitlements TEXT DEFAULT '["8105 - Work limitation (48 hours per fortnight during study session)"]',
      study_entitlements TEXT DEFAULT '["8202 - Meet course requirements"]',
      other_conditions TEXT DEFAULT '["8501 - Maintain adequate health insurance"]',
      
      -- System Audit
      internal_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Audit Logs
  db.exec(`
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
    )
  `);

  // Create indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_visa_ref ON visa_applications(reference_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_visa_passport ON visa_applications(passport_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_visa ON audit_logs(visa_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at)`);

  console.log('Database initialized');
}

// Password hashing
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: `${salt}:${hash}` };
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

// Admin operations
export const adminOps = {
  create(username, password) {
    const { hash } = hashPassword(password);
    const stmt = db.prepare('INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)');
    const result = stmt.run(username, hash, hash.split(':')[0]);
    return result.lastInsertRowid;
  },

  verify(username, password) {
    const stmt = db.prepare('SELECT * FROM admins WHERE username = ?');
    const admin = stmt.get(username);
    if (!admin) return null;
    if (!verifyPassword(password, admin.password_hash)) return null;
    return { id: admin.id, username: admin.username, created_at: admin.created_at };
  },

  getById(id) {
    const stmt = db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?');
    return stmt.get(id);
  }
};

// Visa application operations
export const visaOps = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO visa_applications (
        reference_type, reference_number, passport_number, country_of_passport, date_of_birth,
        given_names, family_name, visa_class_subclass, visa_description, visa_applicant_status,
        visa_status, grant_date, expiry_date, must_not_arrive_after, period_of_stay,
        entries_allowed, location_at_grant, work_entitlements, study_entitlements,
        other_conditions, internal_notes
      ) VALUES (
        @reference_type, @reference_number, @passport_number, @country_of_passport, @date_of_birth,
        @given_names, @family_name, @visa_class_subclass, @visa_description, @visa_applicant_status,
        @visa_status, @grant_date, @expiry_date, @must_not_arrive_after, @period_of_stay,
        @entries_allowed, @location_at_grant, @work_entitlements, @study_entitlements,
        @other_conditions, @internal_notes
      )
    `);
    
    const result = stmt.run({
      reference_type: data.reference_type || 'TRN',
      reference_number: data.reference_number,
      passport_number: data.passport_number,
      country_of_passport: data.country_of_passport,
      date_of_birth: data.date_of_birth,
      given_names: data.given_names,
      family_name: data.family_name,
      visa_class_subclass: data.visa_class_subclass,
      visa_description: data.visa_description,
      visa_applicant_status: data.visa_applicant_status || 'Primary',
      visa_status: data.visa_status || 'In Progress',
      grant_date: data.grant_date || null,
      expiry_date: data.expiry_date || null,
      must_not_arrive_after: data.must_not_arrive_after || null,
      period_of_stay: data.period_of_stay || 'Until Visa Expiry',
      entries_allowed: data.entries_allowed || 'Multiple',
      location_at_grant: data.location_at_grant || 'Offshore',
      work_entitlements: JSON.stringify(data.work_entitlements || ['8105 - Work limitation (48 hours per fortnight during study session)']),
      study_entitlements: JSON.stringify(data.study_entitlements || ['8202 - Meet course requirements']),
      other_conditions: JSON.stringify(data.other_conditions || ['8501 - Maintain adequate health insurance']),
      internal_notes: data.internal_notes || null
    });
    
    return result.lastInsertRowid;
  },

  getById(id) {
    const stmt = db.prepare('SELECT * FROM visa_applications WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return parseVisaRow(row);
  },

  getByReference(referenceNumber) {
    const stmt = db.prepare('SELECT * FROM visa_applications WHERE reference_number = ?');
    const row = stmt.get(referenceNumber);
    if (!row) return null;
    return parseVisaRow(row);
  },

  findByQuery(passportNumber, referenceNumber, dateOfBirth) {
    const stmt = db.prepare(`
      SELECT * FROM visa_applications 
      WHERE passport_number = ? AND reference_number = ? AND date_of_birth = ?
    `);
    const row = stmt.get(passportNumber, referenceNumber, dateOfBirth);
    if (!row) return null;
    return parseVisaRow(row);
  },

  update(id, data, adminId) {
    const existing = this.getById(id);
    if (!existing) return null;

    const stmt = db.prepare(`
      UPDATE visa_applications SET
        reference_type = @reference_type,
        reference_number = @reference_number,
        passport_number = @passport_number,
        country_of_passport = @country_of_passport,
        date_of_birth = @date_of_birth,
        given_names = @given_names,
        family_name = @family_name,
        visa_class_subclass = @visa_class_subclass,
        visa_description = @visa_description,
        visa_applicant_status = @visa_applicant_status,
        visa_status = @visa_status,
        grant_date = @grant_date,
        expiry_date = @expiry_date,
        must_not_arrive_after = @must_not_arrive_after,
        period_of_stay = @period_of_stay,
        entries_allowed = @entries_allowed,
        location_at_grant = @location_at_grant,
        work_entitlements = @work_entitlements,
        study_entitlements = @study_entitlements,
        other_conditions = @other_conditions,
        internal_notes = @internal_notes,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);

    stmt.run({
      id,
      reference_type: data.reference_type || existing.reference_type,
      reference_number: data.reference_number || existing.reference_number,
      passport_number: data.passport_number || existing.passport_number,
      country_of_passport: data.country_of_passport || existing.country_of_passport,
      date_of_birth: data.date_of_birth || existing.date_of_birth,
      given_names: data.given_names || existing.given_names,
      family_name: data.family_name || existing.family_name,
      visa_class_subclass: data.visa_class_subclass || existing.visa_class_subclass,
      visa_description: data.visa_description || existing.visa_description,
      visa_applicant_status: data.visa_applicant_status || existing.visa_applicant_status,
      visa_status: data.visa_status || existing.visa_status,
      grant_date: data.grant_date !== undefined ? data.grant_date : existing.grant_date,
      expiry_date: data.expiry_date !== undefined ? data.expiry_date : existing.expiry_date,
      must_not_arrive_after: data.must_not_arrive_after !== undefined ? data.must_not_arrive_after : existing.must_not_arrive_after,
      period_of_stay: data.period_of_stay || existing.period_of_stay,
      entries_allowed: data.entries_allowed || existing.entries_allowed,
      location_at_grant: data.location_at_grant || existing.location_at_grant,
      work_entitlements: data.work_entitlements ? JSON.stringify(data.work_entitlements) : existing.work_entitlements,
      study_entitlements: data.study_entitlements ? JSON.stringify(data.study_entitlements) : existing.study_entitlements,
      other_conditions: data.other_conditions ? JSON.stringify(data.other_conditions) : existing.other_conditions,
      internal_notes: data.internal_notes !== undefined ? data.internal_notes : existing.internal_notes
    });

    // Log audit
    if (adminId && data.visa_status && data.visa_status !== existing.visa_status) {
      auditOps.create(adminId, id, 'STATUS_CHANGE', existing.visa_status, data.visa_status, data.change_note);
    }

    return this.getById(id);
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM visa_applications WHERE id = ?');
    return stmt.run(id).changes > 0;
  },

  list(limit = 100, offset = 0) {
    const stmt = db.prepare('SELECT * FROM visa_applications ORDER BY updated_at DESC LIMIT ? OFFSET ?');
    const rows = stmt.all(limit, offset);
    return rows.map(parseVisaRow);
  },

  search(query) {
    const stmt = db.prepare(`
      SELECT * FROM visa_applications 
      WHERE reference_number LIKE ? 
         OR passport_number LIKE ?
         OR given_names LIKE ?
         OR family_name LIKE ?
      ORDER BY updated_at DESC LIMIT 50
    `);
    const likeQuery = `%${query}%`;
    const rows = stmt.all(likeQuery, likeQuery, likeQuery, likeQuery);
    return rows.map(parseVisaRow);
  }
};

// Audit operations
export const auditOps = {
  create(adminId, visaId, action, previousStatus, newStatus, notes) {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (admin_id, visa_id, action, previous_status, new_status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(adminId, visaId, action, previousStatus, newStatus, notes);
  },

  getByVisaId(visaId) {
    const stmt = db.prepare(`
      SELECT a.*, ad.username as admin_username 
      FROM audit_logs a
      JOIN admins ad ON a.admin_id = ad.id
      WHERE a.visa_id = ?
      ORDER BY a.created_at DESC
    `);
    return stmt.all(visaId);
  },

  getRecent(limit = 100) {
    const stmt = db.prepare(`
      SELECT a.*, ad.username as admin_username, v.reference_number, v.given_names, v.family_name
      FROM audit_logs a
      JOIN admins ad ON a.admin_id = ad.id
      JOIN visa_applications v ON a.visa_id = v.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
};

// Helper to parse JSON fields from database
function parseVisaRow(row) {
  return {
    ...row,
    work_entitlements: JSON.parse(row.work_entitlements || '[]'),
    study_entitlements: JSON.parse(row.study_entitlements || '[]'),
    other_conditions: JSON.parse(row.other_conditions || '[]')
  };
}

// Migration: Create default admin if none exists
function ensureDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  if (count === 0) {
    const adminId = adminOps.create('admin', 'changeme-immediately');
    console.log('Created default admin (admin/changeme-immediately) - ID:', adminId);
    console.log('IMPORTANT: Change this password immediately!');
  }
}

export { db, ensureDefaultAdmin };