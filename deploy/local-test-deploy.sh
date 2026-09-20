#!/bin/bash

# Local Test Deployment Script for Development/Testing
# This runs everything locally without AWS - useful for development

set -e

echo "=========================================="
echo "  VEVO Local Test Deployment"
echo "=========================================="
echo ""

# Configuration
LOCAL_PORT=3000
PROXY_PORT=8080

echo "Step 1: Checking prerequisites..."

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

# Check npm
if ! command -v npm &>/dev/null; then
    echo "❌ npm is required but not installed"
    exit 1
fi

echo "✓ Node.js $(node --version)"
echo "✓ npm $(npm --version)"

# Step 2: Install dependencies
echo ""
echo "Step 2: Installing dependencies..."

cd /workspaces/immiaccount/admin-server
npm install express sqlite3 connect-sqlite3 express-rate-limit body-parser express-session cors --silent

cd /workspaces/immiaccount/proxy-server
npm install express http-proxy-middleware cheerio axios --silent

echo "✓ Dependencies installed"

# Step 3: Initialize database
echo ""
echo "Step 3: Initializing database..."

cd /workspaces/immiaccount
node -e "
const fs=require('fs'), path=require('path'), sqlite3=require('sqlite3').verbose(), crypto=require('crypto');
const dbPath=path.join('/workspaces/immiaccount/database','immiaccount.db');
const schemaPath=path.join('/workspaces/immiaccount/database','vevo_schema.sql');

if(!fs.existsSync(dbPath)) {
    console.log('Creating new database...');
}

const db=new sqlite3.Database(dbPath);
const schema=fs.readFileSync(schemaPath,'utf8');
const stmts=schema.split(';').filter(s=>s.trim().length>0);

let done=0;
stmts.forEach(s=>{
  db.run(s,(err)=>{
    if(err && !err.message.includes('already exists')) {
      // silent fail for existing tables
    }
    done++;
    if(done===stmts.length){
      const pwd='admin123', salt=crypto.randomBytes(16).toString('hex'), hash=crypto.scryptSync(pwd,salt,64).toString('hex');
      db.run('INSERT OR IGNORE INTO admins (username,password_hash,salt,is_super_admin,is_active) VALUES (?,?,?,1,1)',['admin',hash,salt],()=>{
        console.log('Database ready - default admin: admin/admin123');
        db.close();
      });
    }
  });
});
"

echo "✓ Database initialized"

# Step 4: Create PM2 ecosystem
echo ""
echo "Step 4: Creating process configuration..."

cat > /workspaces/immiaccount/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'vevo-admin',
      script: './admin-server/server.js',
      cwd: '/workspaces/immiaccount',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_PATH: '/workspaces/immiaccount/database/immiaccount.db',
        SESSION_SECRET: 'local-dev-secret'
      },
      log_file: '/tmp/vevo-admin.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'vevo-proxy',
      script: './proxy-server/server.js',
      cwd: '/workspaces/immiaccount',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'development',
        PORT: 8080
      },
      log_file: '/tmp/vevo-proxy.log',
      merge_logs: true,
      time: true
    }
  ]
};
EOF

echo "✓ Process configuration created"

# Step 5: Start with PM2 or directly
echo ""
echo "Step 5: Starting services..."

if command -v pm2 &>/dev/null; then
    cd /workspaces/immiaccount
    pm2 delete all 2>/dev/null || true
    pm2 start ecosystem.config.js
    echo "✓ Services started with PM2"
    echo ""
    echo "Management commands:"
    echo "  pm2 status       - Show service status"
    echo "  pm2 logs         - View all logs"
    echo "  pm2 stop all     - Stop all services"
    echo "  pm2 restart all  - Restart all services"
else
    echo "⚠ PM2 not installed, services need to be started manually"
    echo ""
    echo "To start manually:"
    echo "  Terminal 1: node admin-server/server.js"
    echo "  Terminal 2: node proxy-server/server.js"
fi

echo ""
echo "=========================================="
echo "  LOCAL DEPLOYMENT READY!"
echo "=========================================="
echo ""
echo "Access URLs:"
echo "  Admin Dashboard: http://localhost:3000/admin"
echo "  Login Page: http://localhost:3000/login"
echo "  Proxy Server: http://localhost:8080"
echo ""
echo "Default Login:"
echo "  Username: admin"
echo "  Password: admin123"
echo "  Role: Super Admin"
echo ""
echo "Features enabled:"
echo "  ✓ Browser/machine locking on first login"
echo "  ✓ Super admin panel for lock management"
echo "  ✓ Security logs tracking"
echo "  ✓ Step-by-step visa application flow (to be added)"
echo ""
echo "=========================================="