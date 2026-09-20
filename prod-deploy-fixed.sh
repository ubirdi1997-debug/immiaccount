#!/bin/bash
# Production Deployment Script for VEVO Tracker

set -e

echo "==================================="
echo "VEVO Tracker Production Deployment"
echo "==================================="
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity --profile vevo &>/dev/null; then
    echo "❌ AWS credentials not configured!"
    echo "Run: aws configure --profile vevo"
    exit 1
fi

echo "✓ AWS credentials verified"

# Variables
INSTANCE_NAME="vevo-tracker"
REGION="us-east-1"
ZONE="us-east-1a"
BUNDLE="nano_1_0"
BLUEPRINT="ubuntu_24_04"

echo ""
echo "Creating Lightsail instance..."

# Create instance
aws lightsail create-instances \
    --instance-names "$INSTANCE_NAME" \
    --availability-zone "$ZONE" \
    --blueprint-id "$BLUEPRINT" \
    --bundle-id "$BUNDLE" \
    --region "$REGION" \
    --profile vevo

# Wait for instance using polling
echo "Waiting for instance to be ready..."
for i in {1..30}; do
    STATUS=$(aws lightsail get-instance \
        --instance-name "$INSTANCE_NAME" \
        --region "$REGION" \
        --profile vevo \
        --query 'instance.state.name' \
        --output text 2>/dev/null || echo "pending")
    
    echo "  Status: $STATUS (attempt $i/30)"
    
    if [ "$STATUS" = "running" ]; then
        break
    fi
    
    sleep 10
done

# Get instance IP
INSTANCE_IP=$(aws lightsail get-instance \
    --instance-name "$INSTANCE_NAME" \
    --region "$REGION" \
    --profile vevo \
    --query 'instance.publicIpAddress' \
    --output text)

echo "✓ Instance created: $INSTANCE_IP"

# Create and attach static IP
echo "Creating static IP..."
STATIC_IP_NAME="${INSTANCE_NAME}-ip"

aws lightsail allocate-static-ip \
    --static-ip-name "$STATIC_IP_NAME" \
    --region "$REGION" \
    --profile vevo 2>/dev/null || true

sleep 2

aws lightsail attach-static-ip \
    --static-ip-name "$STATIC_IP_NAME" \
    --instance-name "$INSTANCE_NAME" \
    --region "$REGION" \
    --profile vevo

sleep 2

STATIC_IP=$(aws lightsail get-static-ip \
    --static-ip-name "$STATIC_IP_NAME" \
    --region "$REGION" \
    --profile vevo \
    --query 'staticIp.ipAddress' \
    --output text)

echo "✓ Static IP attached: $STATIC_IP"

# Download default Lightsail key
mkdir -p ~/.ssh
KEY_PATH="$HOME/.ssh/lightsail-${INSTANCE_NAME}.pem"

if [ ! -f "$KEY_PATH" ]; then
    echo "Downloading default Lightsail key..."
    # Get the default key from Lightsail
    aws lightsail download-default-key-pair \
        --region "$REGION" \
        --profile vevo \
        --output text \
        --query 'privateKeyBase64' | base64 -d > "$KEY_PATH"
    chmod 600 "$KEY_PATH"
fi

# Wait for SSH to be available
echo "Waiting for SSH..."
for i in {1..30}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "$KEY_PATH" "ubuntu@$STATIC_IP" "echo SSH ready" 2>/dev/null; then
        echo "✓ SSH available"
        break
    fi
    echo "  Waiting... (attempt $i/30)"
    sleep 10
done

# Generate and copy deployment script
echo ""
echo "Deploying application..."

ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "ubuntu@$STATIC_IP" << 'REMOTESCRIPT'
#!/bin/bash
set -e

echo "=== Server Setup ==="

# System setup
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo "✓ Swap file created"

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
echo "✓ Node.js and Nginx installed"

# Create app directory
sudo mkdir -p /var/www/vevo-tracker
sudo chown ubuntu:ubuntu /var/www/vevo-tracker

cd /var/www/vevo-tracker

# Copy from workspace using git or create manually
# For now, we'll create the necessary files
echo "✓ App directory created"

# Create systemd service
sudo tee /etc/systemd/system/vevo-tracker.service > /dev/null << 'SERVICE'
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
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

echo "✓ Systemd service created"

# Configure Nginx
sudo tee /etc/nginx/sites-available/vevo-tracker > /dev/null << 'NGINX'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/vevo-tracker /etc/nginx/sites-enabled/default
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/vevo-tracker /etc/nginx/sites-enabled/vevo-tracker

echo "✓ Nginx configured"

sudo systemctl restart nginx
echo "✓ Services ready"
REMOTESCRIPT

# SCP the tracker files
echo "Copying tracker files..."
scp -o StrictHostKeyChecking=no -i "$KEY_PATH" -r /workspaces/immiaccount/tracker/* "ubuntu@$STATIC_IP:/var/www/vevo-tracker/"

# Start the service
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "ubuntu@$STATIC_IP" << 'STARTSCRIPT'
cd /var/www/vevo-tracker
sudo npm install 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable vevo-tracker
sudo systemctl start vevo-tracker
sudo systemctl status vevo-tracker --no-pager
STARTSCRIPT

echo ""
echo "==================================="
echo "✓ DEPLOYMENT COMPLETE"
echo "==================================="
echo ""
echo "Admin URL: http://$STATIC_IP/admin"
echo ""
echo "To view logs:"
echo "  ssh -i $KEY_PATH ubuntu@$STATIC_IP 'sudo journalctl -u vevo-tracker -f'"
echo ""

