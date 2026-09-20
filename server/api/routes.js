const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query, run } = require('../database/db');
// Helper function to generate a random token
const generateToken = (length = 64) => {
    return crypto.randomBytes(length).toString('hex');
};

// Helper function to require authentication
const requireAuth = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// Helper function to require super admin role
const requireSuperAdmin = async (req, res, next) => {
    requireAuth(req, res, () => {
        query('SELECT is_super_admin FROM admins WHERE id = ?', [req.session.adminId])
            .then(([admin]) => {
                if (admin.is_super_admin) {
                    next();
                } else {
                    res.status(403).json({ error: 'Forbidden - Super admin privileges required' });
                }
            })
            .catch(err => res.status(500).json({ error: 'Database error' }));
    });
};

// Check if browser is locked for the admin
const checkBrowserLock = async (req, res, next) => {
    requireAuth(req, res, async () => {
        try {
            const admins = await query(
                'SELECT * FROM admins WHERE id = ? AND is_super_admin = FALSE',
                [req.session.adminId]
            );
            
            if (admins.length === 0) return res.status(404).json({ error: 'Admin not found' });
            
            const admin = admins[0];
            
            if (!admin.locked_at || admin.locked_at === null) {
                // This admin is not locked
                const token = generateToken();
                await run(
                    'UPDATE admins SET browser_token = ?, locked_at = NULL WHERE id = ?',
                    [token, req.session.adminId]
                );
                req.token = token; // Set primary token
                req.admin = admin;
                next();
            } else {
                console.warn('User is locked to a specific browser session.');
                // Inform admin they need to continue with a locked browser session
                res.status(403).json({
                    error: 'This account is locked to a specific browser session. '
                            + 'Contact an administrator to resolve access issue.'
                });
            }
        } catch (err) {
            console.error('Error checking browser lock:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
};

// GET /admin/test
router.get('/admin/test', requireAuth, checkBrowserLock, (req, res) => {
    res.json({
        status: 'ok',
        adminId: req.session.adminId,
        locked: req.admin.locked_at,
        message: 'Authentication successful'
    });
});

// API Routes for Applications

// Get all applications
router.get('/admin/api/applications', requireAuth, checkBrowserLock, async (req, res) => {
    try {
        const applications = await query('SELECT * FROM visa_applications');
        res.json(applications);
    } catch (err) {
        console.error('Error fetching applications:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new visa application
router.post('/admin/api/applications', requireAuth, checkBrowserLock, async (req, res) => {
    try {
        const {
            referenceNumber,
            trn,
            passportNumber,
            firstName,
            lastName,
            nationality,
            visaType,
            status,
            visaDetails
        } = req.body;
        
        await run(
            'INSERT INTO visa_applications '
            + '(reference_number, trn, passport_number, first_name, last_name, nationality, visa_type, status, visa_details_json) '
            + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                referenceNumber,
                trn,
                passportNumber,
                firstName,
                lastName,
                nationality,
                visaType,
                status,
                visaDetails
            ]
        );
        
        // Log the action in the audit logs
        await run(
            'INSERT INTO audit_logs (admin_id, visa_id, action, new_status) '
            + 'SELECT ?, last_insert_rowid(), "CREATE", ?',
            [req.session.adminId, status]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating application:', err);
        res.status(500).json({ error: 'Error creating application' });
    }
});

// Update an existing application
router.put('/admin/api/applications/:id', requireAuth, checkBrowserLock, async (req, res) => {
    try {
        const id = req.params.id;
        const {
            trn,
            passportNumber,
            firstName,
            lastName,
            nationality,
            visaType,
            status,
            visaDetails
        } = req.body;
        
        const applicationBeforeUpdate = await query('SELECT status FROM visa_applications WHERE id = ?', [id]);
        const previousStatus = applicationBeforeUpdate[0].status;
        
        await run(
            'UPDATE visa_applications SET '
            + 'trn = ?, passport_number = ?, first_name = ?, last_name = ?, '
            + 'nationality = ?, visa_type = ?, status = ?, visa_details_json = ? '
            + 'WHERE id = ?',
            [
                trn,
                passportNumber,
                firstName,
                lastName,
                nationality,
                visaType,
                status,
                visaDetails,
                id
            ]
        );
        
        await run(
            'INSERT INTO audit_logs (admin_id, visa_id, action, previous_status, new_status) '
            + 'VALUES (?, ?, "UPDATE", ?, ?)',
            [req.session.adminId, id, previousStatus, status]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating application:', err);
        res.status(500).json({ error: 'Error updating application' });
    }
});

// Delete an application
router.delete('/admin/api/applications/:id', requireAuth, checkBrowserLock, async (req, res) => {
    try {
        const id = req.params.id;
        const applicationBeforeDelete = await query('SELECT status FROM visa_applications WHERE id = ?', [id]);
        const previousStatus = applicationBeforeDelete[0].status;
        
        await run('DELETE FROM visa_applications WHERE id = ?', [id]);
        
        await run(
            'INSERT INTO audit_logs (admin_id, visa_id, action, previous_status) '
            + 'VALUES (?, ?, "DELETE", ?)',
            [req.session.adminId, id, previousStatus]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting application:', err);
        res.status(500).json({ error: 'Error deleting application' });
    }
});

// Admin User Management
router.get('/admin/api/users', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const users = await query('SELECT * FROM admins');
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Error fetching users' });
    }
});

// Create Admin User
router.post('/admin/api/users', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { username, is_super_admin } = req.body;
        
        const salt = crypto.randomBytes(16).toString('hex');
        // Since this is a demo, we'll store a sample password hash for demonstration
        const passwordHash = crypto.scryptSync('defaultPassword', salt, 64).toString('hex');
        
        // Generate a default token
        const adminToken = generateToken();
        
        await run(
            'INSERT INTO admins (username, password_hash, salt, is_super_admin, browser_token) '
            + 'VALUES (?, ?, ?, ?, ?)',
            [username, passwordHash, salt, Boolean(is_super_admin), adminToken]
        );
        
        await run(
            'INSERT INTO admin_activity_logs (admin_id, action, details) '
            + 'SELECT last_insert_rowid(), "CREATE_USER", ?',
            [username]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error creating user:', err);
        res.status(500).json({ error: 'Error creating user' });
    }
});

// API to reset browser tokens for an admin
router.post('/admin/api/reset-browser-token', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { adminId } = req.body;
        
        // Generate a new token
        const newToken = generateToken();
        
        // Update the admin's browser token
        await run(
            'UPDATE admins SET browser_token = ?, locked_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newToken, adminId]
        );
        
        await run(
            'INSERT INTO admin_activity_logs (admin_id, action, details) '
            + 'VALUES (?, "RESET_BROWSER_TOKEN", ?)',
            [req.session.adminId, `Admin ID #${adminId}`]
        );
        
        res.json({ success: true, newToken });
    } catch (err) {
        console.error('Error resetting browser token:', err);
        res.status(500).json({ error: 'Error resetting browser token' });
    }
});

module.exports = router;