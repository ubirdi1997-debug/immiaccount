// Admin Application Tracker Server (Port 3000)
import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { db, initDatabase, ensureDefaultAdmin, adminOps, visaOps, auditOps, hashPassword, verifyPassword } from './database.mjs';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initDatabase();
ensureDefaultAdmin();

// Security middleware
app.use(express.json({ limit: '24kb' }));
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'development-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'vevo_admin_session',
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
}));

// Rate limiting for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many failed login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: true
});

// Static files
app.use(express.static('public'));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Please sign in.' });
  }
  req.admin = adminOps.getById(req.session.adminId);
  if (!req.admin) {
    req.session.destroy();
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  next();
};

// API Routes

// Login
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required.' });
    }
    
    const admin = adminOps.verify(username, password);
    if (!admin) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    
    req.session.adminId = admin.id;
    req.session.csrf = require('crypto').randomBytes(32).toString('hex');
    
    res.json({ 
      admin: { id: admin.id, username: admin.username },
      csrf: req.session.csrf
    });
  } catch (e) {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Get current user
app.get('/api/me', (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!req.admin) {
    return res.status(401).json({ error: 'Session expired' });
  }
  res.json({ 
    username: req.admin.username,
    csrf: req.session.csrf
  });
});

// Logout
app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Change password
app.post('/api/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both passwords required.' });
    }
    
    if (newPassword.length < 12 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be 12-128 characters.' });
    }
    
    const admin = adminOps.verify(req.admin.username, currentPassword);
    if (!admin) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    
    const { hash } = hashPassword(newPassword);
    const stmt = db.prepare('UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?');
    stmt.run(hash, hash.split(':')[0], req.admin.id);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not update password.' });
  }
});

// Visa Applications CRUD

// List all
app.get('/api/visas', requireAuth, (req, res) => {
  try {
    const visas = visaOps.list();
    res.json({ visas });
  } catch (e) {
    res.status(500).json({ error: 'Could not load records.' });
  }
});

// Search
app.get('/api/visas/search', requireAuth, (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }
    const visas = visaOps.search(q);
    res.json({ visas });
  } catch (e) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// Get one
app.get('/api/visas/:id', requireAuth, (req, res) => {
  try {
    const visa = visaOps.getById(req.params.id);
    if (!visa) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    const history = auditOps.getByVisaId(visa.id);
    res.json({ visa, history });
  } catch (e) {
    res.status(500).json({ error: 'Could not load record.' });
  }
});

// Create
app.post('/api/visas', requireAuth, (req, res) => {
  try {
    const data = req.body;
    
    // Validate required fields
    const required = ['reference_number', 'passport_number', 'country_of_passport', 'date_of_birth', 
                      'given_names', 'family_name', 'visa_class_subclass', 'visa_description'];
    for (const field of required) {
      if (!data[field]) {
        return res.status(400).json({ error: `${field} is required.` });
      }
    }
    
    // Check for duplicate reference
    const existing = visaOps.getByReference(data.reference_number);
    if (existing) {
      return res.status(409).json({ error: 'Reference number already exists.' });
    }
    
    const id = visaOps.create(data);
    auditOps.create(req.admin.id, id, 'CREATE', null, data.visa_status || 'In Progress', 'Record created');
    
    const visa = visaOps.getById(id);
    res.status(201).json({ visa });
  } catch (e) {
    console.error('Create error:', e);
    res.status(500).json({ error: 'Could not create record.' });
  }
});

// Update
app.patch('/api/visas/:id', requireAuth, (req, res) => {
  try {
    const data = req.body;
    const existing = visaOps.getById(req.params.id);
    
    if (!existing) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    
    // Check version conflict
    if (data.version && data.version !== existing.updated_at) {
      return res.status(409).json({ error: 'This record was modified by another user. Please reload and try again.' });
    }
    
    // Check for duplicate reference if changing
    if (data.reference_number && data.reference_number !== existing.reference_number) {
      const dup = visaOps.getByReference(data.reference_number);
      if (dup) {
        return res.status(409).json({ error: 'Reference number already exists.' });
      }
    }
    
    const visa = visaOps.update(req.params.id, data, req.admin.id);
    res.json({ visa });
  } catch (e) {
    console.error('Update error:', e);
    res.status(500).json({ error: 'Could not update record.' });
  }
});

// Delete
app.delete('/api/visas/:id', requireAuth, (req, res) => {
  try {
    const existing = visaOps.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    
    auditOps.create(req.admin.id, req.params.id, 'DELETE', existing.visa_status, null, 'Record deleted');
    visaOps.delete(req.params.id);
    
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not delete record.' });
  }
});

// Audit logs
app.get('/api/audit', requireAuth, (req, res) => {
  try {
    const logs = auditOps.getRecent(100);
    res.json({ logs });
  } catch (e) {
    res.status(500).json({ error: 'Could not load audit logs.' });
  }
});

// CSRF middleware for non-GET requests
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  
  const csrf = req.headers['x-csrf-token'];
  if (!csrf || csrf !== req.session?.csrf) {
    return res.status(403).json({ error: 'Invalid session token. Reload and try again.' });
  }
  next();
});

// Serve admin UI
app.get('/admin*', (req, res) => {
  res.sendFile('public/admin-dashboard.html', { root: '.' });
});

// Default redirect
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
});

export { app };