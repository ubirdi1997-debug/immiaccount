const crypto = require('crypto');
const { query, run } = require('../../database/db');

// Generate browser fingerprint from request
function generateBrowserFingerprint(req) {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const screenResolution = req.headers['x-screen-resolution'] || '';
    
    // Combine multiple client features to create a fingerprint
    const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${screenResolution}`;
    return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}

// Generate machine token
function generateMachineToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware to check browser/machine lock
async function checkBrowserLock(req, res, next) {
    // Skip check for login page
    if (req.path === '/login' || req.path === '/logout') {
        return next();
    }
    
    // Skip check if no session
    if (!req.session || !req.session.adminId) {
        return next();
    }
    
    try {
        const adminId = req.session.adminId;
        
        // Get admin info
        const admins = await query('SELECT * FROM admins WHERE id = ?', [adminId]);
        if (admins.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }
        
        const admin = admins[0];
        
        // Super admins can access from any machine (optional - remove this if super admins should also be locked)
        // if (admin.is_super_admin) {
        //     return next();
        // }
        
        // Generate current browser fingerprint
        const currentFingerprint = generateBrowserFingerprint(req);
        const currentIp = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        
        // Check if admin has a machine lock
        if (admin.locked_at) {
            // Admin is locked - verify the current browser matches
            if (admin.browser_fingerprint !== currentFingerprint) {
                // Log the blocked access attempt
                await run(
                    'INSERT INTO admin_login_attempts (admin_id, attempted_username, ip_address, user_agent, browser_fingerprint, success, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [adminId, admin.username, currentIp, userAgent, currentFingerprint, false, 'Browser fingerprint mismatch - Machine lock active']
                );
                
                // Destroy session
                req.session.destroy();
                
                // Redirect to contact administrator page
                return res.redirect('/admin/blocked?reason=machine_lock');
            }
            
            // Browser matches - update last activity
            await run(
                'UPDATE admin_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE admin_id = ? AND is_active = TRUE',
                [adminId]
            );
        }
        
        next();
    } catch (err) {
        console.error('Browser lock check error:', err);
        req.session.destroy();
        return res.redirect('/login');
    }
}

// Middleware to set up machine lock on first login
async function setupMachineLock(req, res, admin) {
    try {
        const browserFingerprint = generateBrowserFingerprint(req);
        const machineToken = generateMachineToken();
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        
        // Check if admin already has a machine lock
        if (admin.locked_at) {
            // Admin is already locked to a machine
            return { success: false, reason: 'already_locked' };
        }
        
        // Set up new machine lock
        await run(
            'UPDATE admins SET browser_fingerprint = ?, machine_token = ?, locked_at = CURRENT_TIMESTAMP, last_login_ip = ?, last_user_agent = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
            [browserFingerprint, machineToken, ipAddress, userAgent, admin.id]
        );
        
        // Create session record
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 8); // 8 hour session
        
        await run(
            'INSERT INTO admin_sessions (admin_id, session_token, browser_fingerprint, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [admin.id, req.sessionID, browserFingerprint, ipAddress, userAgent, expiresAt.toISOString()]
        );
        
        // Create machine lock record
        const lockExpiresAt = new Date();
        lockExpiresAt.setDate(lockExpiresAt.getDate() + 30); // 30 day lock
        
        await run(
            'INSERT INTO admin_machine_locks (admin_id, machine_token, browser_fingerprint, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [admin.id, machineToken, browserFingerprint, ipAddress, userAgent, lockExpiresAt.toISOString()]
        );
        
        return { success: true, machineToken };
    } catch (err) {
        console.error('Setup machine lock error:', err);
        return { success: false, reason: 'error' };
    }
}

// Middleware to verify machine lock before login
async function verifyMachineLock(req, admin) {
    try {
        const browserFingerprint = generateBrowserFingerprint(req);
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        
        // Check if admin has a machine lock
        if (!admin.locked_at) {
            // No existing lock - allow login and set up new lock
            return { success: true, action: 'setup_new_lock' };
        }
        
        // Admin has existing lock - verify fingerprint
        if (admin.browser_fingerprint === browserFingerprint) {
            // Browser matches - allow login
            return { success: true, action: 'allow_login' };
        }
        
        // Browser doesn't match - deny login
        // Log the failed attempt
        await run(
            'INSERT INTO admin_login_attempts (admin_id, attempted_username, ip_address, user_agent, browser_fingerprint, success, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [admin.id, admin.username, ipAddress, userAgent, browserFingerprint, false, 'Machine/browser mismatch - Contact super admin']
        );
        
        return { 
            success: false, 
            reason: 'machine_mismatch',
            message: 'This account is locked to a different machine/browser. Please contact your super administrator to reset the machine lock.'
        };
    } catch (err) {
        console.error('Verify machine lock error:', err);
        return { success: false, reason: 'error' };
    }
}

module.exports = {
    checkBrowserLock,
    setupMachineLock,
    verifyMachineLock,
    generateBrowserFingerprint,
    generateMachineToken
};