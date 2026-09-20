const express = require('express');
const router = express.Router();
const path = require('path');

// Import the database functions
const { query, run } = require('../database/db');

// GET admin/users - Render Admin Users page
router.get('/api/users', async (req, res) => {
    try {
        const admins = await query(
            'SELECT * FROM admins WHERE id < 2' // Get only first 100 admins to prevent loading too many rows
        );
        
        res.json({
            success: true,
            type: 'success',
            data: admins
        });
    } catch (err) {
        console.error('Error fetching admin users:', err);
        res.status(500).json({
            success: false,
            type: 'error',
            error: 'Internal server error.
' + err.message
        });
    }
});

exports.default = router;