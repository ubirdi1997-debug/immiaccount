#!/bin/bash
# Deploy script to run on the VM
set -e

echo "=== Deploying VEVO System ==="

APP_DIR="/home/ubuntu/vevo/tracker"
BACKUP_DIR="/home/ubuntu/vevo/backups/$(date +%Y%m%d_%H%M%S)"

echo "Creating backup..."
mkdir -p "$BACKUP_DIR"
if [ -f "$APP_DIR/data/db.json" ]; then
    cp "$APP_DIR/data/db.json" "$BACKUP_DIR/"
fi
if [ -f "$APP_DIR/data/visa.db" ]; then
    cp "$APP_DIR/data/visa.db" "$BACKUP_DIR/"
fi

echo "Installing dependencies..."
cd "$APP_DIR"
npm install --production

echo "Running database migrations..."
# The database auto-migrates on start, but we can verify here
node -e "import('./database.mjs').then(m => { m.initDatabase(); console.log('Database initialized'); })"

echo "Restarting services..."
sudo systemctl restart vevo-admin
sudo systemctl restart vevo-proxy
sudo systemctl reload nginx

echo "=== Deployment complete ==="
sudo systemctl status vevo-admin vevo-proxy --no-pager