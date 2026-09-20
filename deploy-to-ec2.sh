#!/bin/bash
# Deploy VEVO Tracker to EC2 Server

set -e

EC2_IP="34.194.163.33"
EC2_USER="ubuntu"
KEY_FILE="${HOME}/.ssh/vevo-key.pem"

echo "==================================="
echo "Deploying to EC2: $EC2_IP"
echo "==================================="
echo ""

# Check SSH key
if [ ! -f "$KEY_FILE" ]; then
    echo "❌ SSH key not found at $KEY_FILE"
    echo "Please ensure you have the EC2 key pair"
    exit 1
fi

chmod 400 "$KEY_FILE"

echo "📦 Creating deployment package..."

# Create a temporary deployment directory
DEPLOY_DIR=$(mktemp -d)
cp -r /workspaces/immiaccount/tracker "$DEPLOY_DIR/"
cp -r /workspaces/immiaccount/userscripts "$DEPLOY_DIR/"

# Create systemd service files
cat > "$DEPLOY_DIR/vevo-tracker.service" << 'SERVICEEOF'
[Unit]
Description=VEVO Tracker Application
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/vevo-tracker
Environment="NODE_ENV=production"
Environment="HOST=127.0.0.1"
Environment="PORT=3000"
Environment="PUBLIC_ORIGIN=https://admin.vevo.usafe.in"
Environment="VEVO_PUBLIC_ORIGIN=https://vevo.usafe.in"
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Create setup script
cat > "$DEPLOY_DIR/setup.sh" << 'SETUPEOF'
#!/bin/bash
set -e

echo "Setting up VEVO Tracker..."

# Install dependencies
sudo apt-get update
sudo apt-get install -y nodejs npm nginx

# Create app directory
sudo mkdir -p /opt/vevo-tracker
sudo cp -r /tmp/tracker-deploy/* /opt/vevo-tracker/
sudo chown -R ubuntu:ubuntu /opt/vevo-tracker

# Install npm dependencies
cd /opt/vevo-tracker
npm install

# Setup nginx
sudo cp /opt/vevo-tracker/nginx/vevo.usafe.in.production /etc/nginx/sites-available/vevo
sudo ln -sf /etc/nginx/sites-available/vevo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config
sudo nginx -t

# Install systemd service
sudo cp /tmp/tracker-deploy/vevo-tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable vevo-tracker

# Start services
sudo systemctl start vevo-tracker
sudo systemctl restart nginx

echo "✅ Deployment complete!"
echo "Admin: https://admin.vevo.usafe.in"
echo "VEVO Proxy: https://vevo.usafe.in"
SETUPEOF

echo "🚀 Uploading to EC2..."

# Upload files
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "$DEPLOY_DIR/tracker" "$EC2_USER@$EC2_IP:/tmp/tracker-deploy"
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "$DEPLOY_DIR/userscripts" "$EC2_USER@$EC2_IP:/tmp/tracker-deploy/"
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "$DEPLOY_DIR/vevo-tracker.service" "$EC2_USER@$EC2_IP:/tmp/"
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no "$DEPLOY_DIR/setup.sh" "$EC2_USER@$EC2_IP:/tmp/"

# Run setup on EC2
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" "chmod +x /tmp/setup.sh && sudo /tmp/setup.sh"

# Cleanup
rm -rf "$DEPLOY_DIR"

echo ""
echo "==================================="
echo "✅ Deployment Complete!"
echo "==================================="
echo ""
echo "Admin Dashboard: https://admin.vevo.usafe.in"
echo "VEVO Proxy: https://vevo.usafe.in"
echo ""
