#!/bin/bash
# AWS Lightsail Ubuntu 24.04 Setup Script
set -e

echo "=== VEVO System Setup ==="

# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install dependencies
sudo apt-get install -y nginx sqlite3 build-essential python3

# Create application directory
sudo mkdir -p /home/ubuntu/vevo
sudo chown ubuntu:ubuntu /home/ubuntu/vevo

# Setup log directories
sudo mkdir -p /var/log/vevo
sudo chown ubuntu:ubuntu /var/log/vevo

# Setup runtime directories
sudo mkdir -p /run/vevo
sudo chown ubuntu:ubuntu /run/vevo

# Create environment file
cat > /home/ubuntu/vevo/.env << 'ENVFILE'
# VEVO Environment
NODE_ENV=production
PORT=3000
SESSION_SECRET=$(openssl rand -hex 32)
ORIGIN=https://vevo.usafe.in
ENVFILE

sudo chown ubuntu:ubuntu /home/ubuntu/vevo/.env

echo "=== Dependencies installed ==="
echo "Next steps:"
echo "1. Copy tracker directory to /home/ubuntu/vevo/"
echo "2. Run: cd /home/ubuntu/vevo/tracker && npm install"
echo "3. Copy service files to /etc/systemd/system/"
echo "4. Enable services: sudo systemctl enable vevo-admin vevo-proxy"
echo "5. Configure nginx: sudo cp deploy/nginx.conf /etc/nginx/sites-available/vevo"
echo "6. Test nginx: sudo nginx -t && sudo systemctl reload nginx"