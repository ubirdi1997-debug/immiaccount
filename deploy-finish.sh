#!/bin/bash
# Finish deployment - manual SSH key handling

STATIC_IP="35.172.173.43"
INSTANCE_NAME="vevo-tracker"
KEY_PATH="$HOME/.ssh/lightsail-${INSTANCE_NAME}.pem"

echo "Instance is running at: $STATIC_IP"
echo ""
echo "To complete deployment, you need to set up SSH access."
echo ""
echo "Option 1: Use AWS Console to download the Lightsail key:"
echo "  - Go to: https://lightsail.aws.amazon.com/"
echo "  - Click on your instance"
echo "  - Click 'Connect' and download the default key"
echo "  - Save it to: $KEY_PATH"
echo "  - Run: chmod 600 $KEY_PATH"
echo ""
echo "Option 2: Use your own existing key with Lightsail:"
echo ""
echo "Option 3: Connect manually to set up the server:"
echo "  - Use the AWS Lightsail browser console to connect"
echo "  - Then run the setup commands manually"
echo ""
echo "Once you have SSH access, run this script to complete setup:"
echo ""

# Generate the completion script
cat > /tmp/complete-setup.sh << 'COMPLETESCRIPT'
#!/bin/bash
set -e

echo "=== Completing Server Setup ==="

# System setup
sudo fallocate -l 1G /swapfile 2>/dev/null || true
sudo chmod 600 /swapfile 2>/dev/null || true
sudo mkswap /swapfile 2>/dev/null || true
sudo swapon /swapfile 2>/dev/null || true
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab 2>/dev/null || true
echo "✓ Swap file created"

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
echo "✓ Node.js and Nginx installed"

# Create app directory
sudo mkdir -p /var/www/vevo-tracker
sudo chown ubuntu:ubuntu /var/www/vevo-tracker

cd /var/www/vevo-tracker

echo "✓ App directory ready"

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

sudo systemctl daemon-reload
sudo systemctl enable vevo-tracker
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

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/vevo-tracker /etc/nginx/sites-enabled/vevo-tracker
sudo systemctl restart nginx
echo "✓ Nginx configured"

echo ""
echo "Server is ready. Now copy your tracker files to /var/www/vevo-tracker/"
echo "Then run: sudo systemctl start vevo-tracker"
COMPLETESCRIPT

echo "A completion script has been saved to /tmp/complete-setup.sh"
echo ""
echo "Summary:"
echo "  Instance: $INSTANCE_NAME"
echo "  Static IP: $STATIC_IP"
echo "  Admin URL: http://$STATIC_IP/"
echo ""
