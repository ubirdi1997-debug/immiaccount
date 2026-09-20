const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');
const { query, run } = require('../database/db');

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

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.adminId) {
        return next();
    }
    res.redirect('/login');
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
        const hash = crypto.scryptSync(password, admin.salt, 64).toString('hex');
        if (hash === admin.password_hash) {
            req.session.adminId = admin.id;
            return res.redirect('/admin');
        } else {
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