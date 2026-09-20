const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database file path
const dbPath = path.join(__dirname, 'immiaccount.db');

// Initialize the database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Run initialization script
        const initScript = fs.readFileSync(path.join(__dirname, 'init.sql')).toString();
        db.exec(initScript, (err) => {
            if (err) {
                console.error('Error initializing database:', err.message);
            } else {
                console.log('Database initialized successfully.');
            }
        });
    }
});

// Helper function for parameterized queries
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

// Helper function for parameterized insert/update queries
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
};

module.exports = { db, query, run };