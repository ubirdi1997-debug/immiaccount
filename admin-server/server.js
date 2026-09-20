const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { query, run } = require('../database/db');
const { checkBrowserLock, setupMachineLock, verifyMachineLock } = require('./middleware/browserLock');
const superAdminRoutes = require('./routes/superAdmin');

const app = express();
const port = 3000;

// Rate limiting for /login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Max 5 attempts
    message: 'Too many login attempts, please try again later.'
});

// Session configuration
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db' }), // Separate DB for sessions
    secret: 'your-secret-key', // Change this to a secure secret in production
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
}));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(checkBrowserLock);

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    res.redirect('/login');
};

// Check if user is super admin middleware
const requireSuperAdmin = async (req, res, next) => {
    if (!req.session || !req.session.adminId) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const admins = await query('SELECT * FROM admins WHERE id = ? AND is_super_admin = TRUE', [req.session.adminId]);
        if (admins.length === 0) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        next();
    } catch (err) {
        console.error('Super admin check error:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

// Routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    try {
        const admins = await query('SELECT * FROM admins WHERE username = ?', [username]);
        if (admins.length === 0) {
            return res.status(401).send('Invalid username or password.');
        }

        const admin = admins[0];
        
        // Check if account is active
        if (!admin.is_active) {
            return res.status(401).send('Account is disabled. Contact your super administrator.');
        }
        
        const hash = crypto.scryptSync(password, admin.salt, 64).toString('hex');
        if (hash === admin.password_hash) {
            // Verify machine/browser lock
            const lockResult = await verifyMachineLock(req, admin);
            
            if (!lockResult.success) {
                if (lockResult.reason === 'machine_mismatch') {
                    // Redirect to blocked page with contact administrator message
                    return res.redirect('/admin/blocked?reason=machine_lock');
                }
                return res.status(500).send('Error verifying machine lock.');
            }
            
            // Set session
            req.session.adminId = admin.id;
            
            // If new lock needed, set it up
            if (lockResult.action === 'setup_new_lock') {
                const setupResult = await setupMachineLock(req, res, admin);
                if (setupResult.success) {
                    console.log(`Machine lock set up for admin: ${admin.username}`);
                }
            } else {
                // Update last login info
                const ipAddress = req.ip || req.connection.remoteAddress;
                const userAgent = req.headers['user-agent'] || '';
                await run(
                    'UPDATE admins SET last_login_at = CURRENT_TIMESTAMP, last_login_ip = ?, last_user_agent = ? WHERE id = ?',
                    [ipAddress, userAgent, admin.id]
                );
            }
            
            // Log successful login
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || '';
            await run(
                'INSERT INTO admin_login_attempts (admin_id, attempted_username, ip_address, user_agent, browser_fingerprint, success, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [admin.id, admin.username, ipAddress, userAgent, admin.browser_fingerprint || '', true, 'Login successful']
            );
            
            return res.redirect('/admin');
        } else {
            // Log failed attempt
            const ipAddress = req.ip || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'] || '';
            await run(
                'INSERT INTO admin_login_attempts (admin_id, attempted_username, ip_address, user_agent, browser_fingerprint, success, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [admin.id, admin.username, ipAddress, userAgent, '', false, 'Invalid password']
            );
            return res.status(401).send('Invalid username or password.');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send('Internal server error.');
    }
});

app.get('/admin', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

app.get('/admin/applications', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/applications.html'));
});

app.get('/admin/audit-logs', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/audit-logs.html'));
});

app.get('/admin/users', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/users.html'));
});

// Logout route
app.post('/logout', requireAuth, async (req, res) => {
    try {
        // Deactivate all sessions for this admin
        await run(
            'UPDATE admin_sessions SET is_active = FALSE, ended_at = CURRENT_TIMESTAMP WHERE admin_id = ?',
            [req.session.adminId]
        );
        
        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout error:', err);
            }
            res.redirect('/login');
        });
    } catch (err) {
        console.error('Logout error:', err);
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
});

app.get('/admin/super-admin', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/super-admin.html'));
});

app.get('/admin/blocked', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/blocked.html'));
});

app.get('/admin/security-logs', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/security-logs.html'));
});

// Mount super admin API routes
app.use('/admin/api/super-admin', superAdminRoutes);

// Initialize database
const initializeDatabase = () => {
    const initScript = fs.readFileSync(path.join(__dirname, '../database/vevo_schema.sql')).toString();
    run(initScript)
        .then(() => console.log('Database initialized successfully.'))
        .catch(err => console.error('Error initializing database:', err));
};

initializeDatabase();

// Start server
app.listen(port, () => {
    console.log(`Admin panel running on http://localhost:${port}`);
});