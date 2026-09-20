#!/bin/bash
# Production Deployment Script for VEVO Tracker

set -e

echo "==================================="
echo "VEVO Tracker Production Deployment"
echo "==================================="
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo "❌ AWS credentials not configured!"
    echo "Run: aws configure"
    exit 1
fi

echo "✓ AWS credentials verified"

# Variables
INSTANCE_NAME="vevo-tracker"
REGION="us-east-1"
ZONE="us-east-1a"
BUNDLE="nano_1_0"  # $3.50/month
BLUEPRINT="ubuntu_24_04"

echo ""
echo "Creating Lightsail instance..."

# Create instance
aws lightsail create-instances \
    --instance-names "$INSTANCE_NAME" \
    --availability-zone "$ZONE" \
    --blueprint-id "$BLUEPRINT" \
    --bundle-id "$BUNDLE" \
    --region "$REGION"

# Wait for instance
echo "Waiting for instance to be ready..."
aws lightsail wait instance-running \
    --instance-name "$INSTANCE_NAME" \
    --region "$REGION"

# Get instance IP
INSTANCE_IP=$(aws lightsail get-instance \
    --instance-name "$INSTANCE_NAME" \
    --region "$REGION" \
    --query 'instance.publicIpAddress' \
    --output text)

echo "✓ Instance created: $INSTANCE_IP"

# Create and attach static IP
echo "Creating static IP..."
STATIC_IP_NAME="${INSTANCE_NAME}-ip"
aws lightsail allocate-static-ip \
    --static-ip-name "$STATIC_IP_NAME" \
    --region "$REGION" 2>/dev/null || true

aws lightsail attach-static-ip \
    --static-ip-name "$STATIC_IP_NAME" \
    --instance-name "$INSTANCE_NAME" \
    --region "$REGION"

STATIC_IP=$(aws lightsail get-static-ip \
    --static-ip-name "$STATIC_IP_NAME" \
    --region "$REGION" \
    --query 'staticIp.ipAddress' \
    --output text)

echo "✓ Static IP attached: $STATIC_IP"

# Generate deployment commands script
cat > /tmp/deploy-commands.sh << 'EOF'
#!/bin/bash
set -e

# System setup
echo "=== System Setup ==="
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Nginx
sudo apt-get install -y nginx

# Create app directory
sudo mkdir -p /var/www/vevo-tracker
cd /var/www/vevo-tracker

EOF

cat >> /tmp/deploy-commands.sh << EOFCOMMANDS
# Copy application files (will be scp'd separately)
cd /var/www/vevo-tracker

# Create package.json
cat > package.json << 'PACKAGEEOF'
{
  "name": "vevo-tracker",
  "version": "1.0.0",
  "main": "server.mjs",
  "scripts": {
    "start": "node server.mjs"
  },
  "dependencies": {}
}
PACKAGEEOF

# Install dependencies
npm install

# Create systemd service
sudo tee /etc/systemd/system/vevo-tracker.service << 'SERVICEEOF'
[Unit]
Description=VEVO Tracker Application
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/var/www/vevo-tracker
ExecStart=/usr/bin/node server.mjs
Restart=always
Environment=PORT=3000
Environment=ORIGIN=http://localhost:3000

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Configure Nginx
sudo tee /etc/nginx/sites-available/vevo-tracker << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF

sudo ln -sf /etc/nginx/sites-available/vevo-tracker /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Start services
sudo systemctl daemon-reload
sudo systemctl enable vevo-tracker
sudo systemctl start vevo-tracker
sudo systemctl restart nginx

echo "=== Deployment Complete ==="
echo "App running at: http://$STATIC_IP"
EOFCOMMANDS

chmod +x /tmp/deploy-commands.sh

# Copy files to instance
echo ""
echo "Copying application files..."
scp -o StrictHostKeyChecking=no -i ~/.ssh/lightsail-vevo.pem /tmp/deploy-commands.sh "ubuntu@$STATIC_IP:/tmp/" 2>/dev/null || {
    # Create new key pair
    echo "Creating SSH key pair..."
    aws lightsail create-key-pair --key-pair-name vevo-key --query 'privateKeyBase64' --output text | base64 -d > ~/.ssh/lightsail-vevo.pem
    chmod 600 ~/.ssh/lightsail-vevo.pem
    sleep 5
}

# SCP tracker files
scp -o StrictHostKeyChecking=no -i ~/.ssh/lightsail-vevo.pem -r /workspaces/immiaccount/tracker/* "ubuntu@$STATIC_IP:/var/www/vevo-tracker/" 2>/dev/null || echo "Files will be copied manually"

# Execute deployment
ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail-vevo.pem "ubuntu@$STATIC_IP" "sudo bash /tmp/deploy-commands.sh"

echo ""
echo "==================================="
echo "✓ DEPLOYMENT COMPLETE"
echo "==================================="
echo ""
echo "Admin URL: http://$STATIC_IP/admin"
echo "Default login: Check your tracker credentials"
echo ""
echo "To SSH into server:"
echo "  ssh -i ~/.ssh/lightsail-vevo.pem ubuntu@$STATIC_IP"
echo ""
echo "To view logs:"
echo "  ssh -i ~/.ssh/lightsail-vevo.pem ubuntu@$STATIC_IP 'sudo journalctl -u vevo-tracker -f'"

