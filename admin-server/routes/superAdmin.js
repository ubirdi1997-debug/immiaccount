const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { query, run } = require('../../database/db');

// Middleware to check if user is super admin
const requireSuperAdmin = async (req, res, next) => {
    if (!req.session || !req.session.adminId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const admins = await query('SELECT * FROM admins WHERE id = ? AND is_super_admin = TRUE', [req.session.adminId]);
        if (admins.length === 0) {
            return res.status(403).json({ success: false, error: 'Forbidden - Super admin privileges required' });
        }
        req.admin = admins[0];
        next();
    } catch (err) {
        console.error('Super admin check error:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// Get dashboard data
router.get('/dashboard', requireSuperAdmin, async (req, res) => {
    try {
        // Get stats
        const totalAdmins = await query('SELECT COUNT(*) as count FROM admins');
        const activeSessions = await query('SELECT COUNT(*) as count FROM admin_sessions WHERE is_active = TRUE');
        const lockedAccounts = await query('SELECT COUNT(*) as count FROM admins WHERE locked_at IS NOT NULL');
        const failedLogins = await query(`
            SELECT COUNT(*) as count FROM admin_login_attempts 
            WHERE success = FALSE AND attempted_at > datetime('now', '-1 day')
        `);
        
        // Get all admins
        const admins = await query(`
            SELECT a.id, a.username, a.is_super_admin, a.is_active, a.browser_fingerprint, a.machine_token, 
                   a.locked_at, a.last_login_at, a.last_login_ip, 
                   (SELECT COUNT(*) FROM admin_sessions WHERE admin_id = a.id AND is_active = TRUE) as active_sessions
            FROM admins a
            ORDER BY a.created_at DESC
        `);
        
        // Get security logs (last 10 login attempts)
        const securityLogs = await query(`
            SELECT al.*, a.username as admin_username
            FROM admin_login_attempts al
            LEFT JOIN admins a ON al.admin_id = a.id
            ORDER BY al.attempted_at DESC
            LIMIT 10
        `);
        
        // Get active sessions
        const sessions = await query(`
            SELECT s.*, a.username
            FROM admin_sessions s
            JOIN admins a ON s.admin_id = a.id
            WHERE s.is_active = TRUE
            ORDER BY s.created_at DESC
        `);
        
        res.json({
            success: true,
            currentAdmin: { username: req.admin.username },
            stats: {
                totalAdmins: totalAdmins[0].count,
                activeSessions: activeSessions[0].count,
                lockedAccounts: lockedAccounts[0].count,
                failedLogins: failedLogins[0].count
            },
            admins,
            securityLogs,
            sessions
        });
    } catch (err) {
        console.error('Dashboard data error:', err);
        res.status(500).json({ success: false, error: 'Error loading dashboard data' });
    }
});

// Create new admin
router.post('/create-admin', requireSuperAdmin, async (req, res) => {
    try {
        const { username, password, isSuperAdmin } = req.body;
        
        // Check if username already exists
        const existing = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.json({ success: false, error: 'Username already exists' });
        }
        
        // Hash password
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
        
        // Insert new admin
        await run(
            'INSERT INTO admins (username, password_hash, salt, is_super_admin, is_active) VALUES (?, ?, ?, ?, ?)',
            [username, passwordHash, salt, isSuperAdmin ? 1 : 0, 1]
        );
        
        // Log the action
        await run(
            'INSERT INTO audit_logs (admin_id, action, notes) VALUES (?, ?, ?)',
            [req.session.adminId, 'CREATE_ADMIN', `Created admin: ${username}, SuperAdmin: ${isSuperAdmin}`]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Create admin error:', err);
        res.status(500).json({ success: false, error: 'Error creating admin' });
    }
});

// Reset machine lock
router.post('/reset-machine-lock', requireSuperAdmin, async (req, res) => {
    try {
        const { adminId, reason } = req.body;
        
        // Get admin info before reset
        const admin = await query('SELECT * FROM admins WHERE id = ?', [adminId]);
        if (admin.length === 0) {
            return res.json({ success: false, error: 'Admin not found' });
        }
        
        // Clear machine lock
        await run(
            'UPDATE admins SET browser_fingerprint = NULL, machine_token = NULL, locked_at = NULL WHERE id = ?',
            [adminId]
        );
        
        // Deactivate all sessions for this admin
        await run(
            'UPDATE admin_sessions SET is_active = FALSE WHERE admin_id = ?',
            [adminId]
        );
        
        // Log the action
        await run(
            'INSERT INTO audit_logs (admin_id, action, notes) VALUES (?, ?, ?)',
            [req.session.adminId, 'RESET_MACHINE_LOCK', `Reset machine lock for admin: ${admin[0].username}. Reason: ${reason}`]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Reset machine lock error:', err);
        res.status(500).json({ success: false, error: 'Error resetting machine lock' });
    }
});

// Reset password
router.post('/reset-password', requireSuperAdmin, async (req, res) => {
    try {
        const { adminId, newPassword } = req.body;
        
        // Get admin info
        const admin = await query('SELECT * FROM admins WHERE id = ?', [adminId]);
        if (admin.length === 0) {
            return res.json({ success: false, error: 'Admin not found' });
        }
        
        // Hash new password
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
        
        // Update password
        await run(
            'UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?',
            [passwordHash, salt, adminId]
        );
        
        // Log the action
        await run(
            'INSERT INTO audit_logs (admin_id, action, notes) VALUES (?, ?, ?)',
            [req.session.adminId, 'RESET_PASSWORD', `Reset password for admin: ${admin[0].username}`]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, error: 'Error resetting password' });
    }
});

// Toggle admin status
router.post('/toggle-status', requireSuperAdmin, async (req, res) => {
    try {
        const { adminId, isActive } = req.body;
        
        // Get admin info
        const admin = await query('SELECT * FROM admins WHERE id = ?', [adminId]);
        if (admin.length === 0) {
            return res.json({ success: false, error: 'Admin not found' });
        }
        
        // Update status
        await run(
            'UPDATE admins SET is_active = ? WHERE id = ?',
            [isActive ? 1 : 0, adminId]
        );
        
        // If deactivating, also terminate all sessions
        if (!isActive) {
            await run(
                'UPDATE admin_sessions SET is_active = FALSE WHERE admin_id = ?',
                [adminId]
            );
        }
        
        // Log the action
        await run(
            'INSERT INTO audit_logs (admin_id, action, notes) VALUES (?, ?, ?)',
            [req.session.adminId, isActive ? 'ACTIVATE_ADMIN' : 'DEACTIVATE_ADMIN', `${isActive ? 'Activated' : 'Deactivated'} admin: ${admin[0].username}`]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Toggle status error:', err);
        res.status(500).json({ success: false, error: 'Error updating admin status' });
    }
});

// Terminate session
router.post('/terminate-session', requireSuperAdmin, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        await run(
            'UPDATE admin_sessions SET is_active = FALSE WHERE id = ?',
            [sessionId]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Terminate session error:', err);
        res.status(500).json({ success: false, error: 'Error terminating session' });
    }
});

// Terminate all sessions
router.post('/terminate-all-sessions', requireSuperAdmin, async (req, res) => {
    try {
        await run('UPDATE admin_sessions SET is_active = FALSE');
        
        // Log the action
        await run(
            'INSERT INTO audit_logs (admin_id, action, notes) VALUES (?, ?, ?)',
            [req.session.adminId, 'TERMINATE_ALL_SESSIONS', 'All admin sessions terminated']
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Terminate all sessions error:', err);
        res.status(500).json({ success: false, error: 'Error terminating sessions' });
    }
});

module.exports = router;