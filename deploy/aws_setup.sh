#!/bin/bash

# AWS Lightsail Setup Script

# Variables
INSTANCE_NAME="vevo-app-instance"
SSH_KEY_NAME="vevo-app-key"
STATIC_IP_NAME="vevo-app-ip"

# Create SSH key pair for Lightsail
aws lightsail create-key-pair --key-pair-name $SSH_KEY_NAME --query 'keyPair.privateKeyBase64' --output text > $SSH_KEY_NAME.pem
chmod 600 $SSH_KEY_NAME.pem

# Create a Lightsail instance
aws lightsail create-instances \
    --instance-names $INSTANCE_NAME \
    --availability-zone us-east-1a \
    --blueprint-id ubuntu_24_04 \
    --bundle-id nano_1_0 \
    --key-pair-name $SSH_KEY_NAME

# Wait for instance to be ready
echo "Waiting for instance to be ready..."
aws lightsail wait instance-ssh-enabled --instance-name $INSTANCE_NAME

# Allocate a static IP
aws lightsail allocate-static-ip --static-ip-name $STATIC_IP_NAME

# Attach static IP to instance
aws lightsail attach-static-ip --static-ip-name $STATIC_IP_NAME --instance-name $INSTANCE_NAME

# Get the static IP address
STATIC_IP=$(aws lightsail get-static-ip --static-ip-name $STATIC_IP_NAME --query 'staticIp.ipAddress' --output text)

echo "Instance created successfully!"
echo "Static IP: $STATIC_IP"
echo "You can now SSH into the instance using:"
echo "ssh -i $SSH_KEY_NAME.pem ubuntu@$STATIC_IP"

# Create and upload deployment script
cat > deploy_script.sh << 'EOF'
#!/bin/bash

# Set up swap file (1GB)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Install Node.js and npm
sudo apt update
sudo apt install -y nodejs npm

# Install SQLite3
sudo apt install -y sqlite3

# Install Nginx
sudo apt install -y nginx

# Create deployment directory
sudo mkdir -p /var/www/vevo-app

# Install the application files (assuming they're in /workspaces/immiaccount)
sudo cp -r /workspaces/immiaccount/admin-server/* /var/www/vevo-app/
sudo cp -r /workspaces/immiaccount/proxy-server/* /var/www/vevo-app/
sudo cp -r /workspaces/immiaccount/public/* /var/www/vevo-app/public/

# Install dependencies
cd /var/www/vevo-app
sudo npm install

# Set up database
sudo mkdir -p /var/www/vevo-app/database

# Copy the database schema
sudo cp /workspaces/immiaccount/database/vevo_schema.sql /var/www/vevo-app/database/

# Initialize the database
sudo sqlite3 /var/www/vevo-app/database/app.db < /var/www/vevo-app/database/vevo_schema.sql

# Configure Nginx
sudo cp /workspaces/immiaccount/nginx/vevo.usafe.in /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/vevo.usafe.in /etc/nginx/sites-enabled/

# Test the configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Set up Systemd services
sudo cp /workspaces/immiaccount/systemd/vevo-admin.service /etc/systemd/system/
sudo cp /workspaces/immiaccount/systemd/vevo-proxy.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable --now vevo-admin vevo-proxy

# Add a default admin user (for testing purposes)
cd /var/www/vevo-app
sudo node -e "
const crypto = require('crypto');
const { run } = require('./database/db');
const password = 'admin123';
const salt = crypto.randomBytes(16).toString('hex');
const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
run('INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)', ['admin', passwordHash, salt])
.then(() => console.log('Default admin user created successfully'))
.catch(err => console.error('Error creating admin user:', err));
"

# Display login information
echo "\nApplication deployed successfully!"
echo "Login URL: http://$STATIC_IP/admin"
echo "Default admin credentials:"
echo "Username: admin"
echo "Password: admin123"
EOF

# Upload deployment script
scp -i $SSH_KEY_NAME.pem deploy_script.sh ubuntu@$STATIC_IP:/home/ubuntu/

# Execute deployment script
ssh -i $SSH_KEY_NAME.pem ubuntu@$STATIC_IP "chmod +x /home/ubuntu/deploy_script.sh && sudo /home/ubuntu/deploy_script.sh"

# Display final information
echo "\nDeployment completed!"
echo "Visit http://$STATIC_IP/admin to access the admin panel"
echo "Default admin credentials:"
echo "Username: admin"
echo "Password: admin123"
