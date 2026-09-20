#!/bin/bash
# EC2 Deployment Script for VEVO Tracker - Fully Automated

set -e

echo "==================================="
echo "VEVO Tracker EC2 Deployment"
echo "==================================="
echo ""

# Configuration
KEY_NAME="vevo-tracker-key-$(date +%s)"
INSTANCE_NAME="vevo-tracker"
REGION="us-east-1"
ZONE="us-east-1a"

echo "Creating EC2 Key Pair..."

# Create key pair and save locally
mkdir -p ~/.ssh
KEY_PATH="$HOME/.ssh/${KEY_NAME}.pem"

aws ec2 create-key-pair \
    --key-name "$KEY_NAME" \
    --region "$REGION" \
    --profile vevo \
    --query 'KeyMaterial' \
    --output text > "$KEY_PATH"

chmod 400 "$KEY_PATH"
echo "✓ Key saved to $KEY_PATH"

# Get latest Ubuntu 24.04 AMI
echo "Finding Ubuntu AMI..."
AMI_ID=$(aws ec2 describe-images \
    --owners 099720109477 \
    --filters 'Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server*' 'Name=state,Values=available' \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --region "$REGION" \
    --profile vevo \
    --output text)

echo "✓ Using AMI: $AMI_ID"

# Create security group
echo "Creating Security Group..."
SG_NAME="vevo-tracker-sg"

# Check if SG exists
EXISTING_SG=$(aws ec2 describe-security-groups \
    --group-names "$SG_NAME" \
    --region "$REGION" \
    --profile vevo \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_SG" ] || [ "$EXISTING_SG" = "None" ]; then
    SG_ID=$(aws ec2 create-security-group \
        --group-name "$SG_NAME" \
        --description "VEVO Tracker Security Group" \
        --region "$REGION" \
        --profile vevo \
        --query 'GroupId' \
        --output text)
    
    # Add rules
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" \
        --profile vevo 2>/dev/null || true
    
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" \
        --profile vevo 2>/dev/null || true
    
    aws ec2 authorize-security-group-ingress \
        --group-id "$SG_ID" \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --region "$REGION" \
        --profile vevo 2>/dev/null || true
    
    echo "✓ Security Group created: $SG_ID"
else
    SG_ID="$EXISTING_SG"
    echo "✓ Using existing Security Group: $SG_ID"
fi

# Create user-data script
USER_DATA=$(cat << 'USERDATA'
#!/bin/bash
exec > /var/log/user-data.log 2>&1
set -x

echo "=== Starting setup at $(date) ==="

# Update system
apt-get update
apt-get upgrade -y

# Create swap
fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx git

# Create app directory
mkdir -p /var/www/vevo-tracker
chown ubuntu:ubuntu /var/www/vevo-tracker

# Create systemd service
cat > /etc/systemd/system/vevo-tracker.service << 'SERVICE'
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

systemctl daemon-reload
systemctl enable vevo-tracker

# Configure Nginx
cat > /etc/nginx/sites-available/vevo-tracker << 'NGINX'
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
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/vevo-tracker /etc/nginx/sites-enabled/vevo-tracker
systemctl restart nginx

echo "=== Setup complete at $(date) ==="
echo "Ready for application deployment"
USERDATA
)

echo "Creating EC2 instance..."

# Launch instance
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI_ID" \
    --instance-type t3.micro \
    --key-name "$KEY_NAME" \
    --security-group-ids "$SG_ID" \
    --placement AvailabilityZone="$ZONE" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
    --user-data "$USER_DATA" \
    --region "$REGION" \
    --profile vevo \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "✓ Instance created: $INSTANCE_ID"

# Wait for instance to be running
echo "Waiting for instance to start..."
aws ec2 wait instance-running \
    --instance-ids "$INSTANCE_ID" \
    --region "$REGION" \
    --profile vevo

echo "✓ Instance is running"

# Allocate and associate Elastic IP
echo "Creating Elastic IP..."
ALLOCATION_ID=$(aws ec2 allocate-address \
    --region "$REGION" \
    --profile vevo \
    --query 'AllocationId' \
    --output text)

aws ec2 associate-address \
    --instance-id "$INSTANCE_ID" \
    --allocation-id "$ALLOCATION_ID" \
    --region "$REGION" \
    --profile vevo

echo "✓ Elastic IP associated"

# Get public IP
sleep 2
PUBLIC_IP=$(aws ec2 describe-addresses \
    --allocation-ids "$ALLOCATION_ID" \
    --region "$REGION" \
    --profile vevo \
    --query 'Addresses[0].PublicIp' \
    --output text)

echo ""
echo "✓ Server IP: $PUBLIC_IP"

# Wait for SSH
echo ""
echo "Waiting for SSH to be available..."
for i in {1..30}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes -i "$KEY_PATH" "ubuntu@$PUBLIC_IP" "echo ready" 2>/dev/null; then
        echo "✓ SSH available"
        break
    fi
    echo "  Attempt $i/30..."
    sleep 10
done

# Wait a bit more for cloud-init to complete
echo "Waiting for server setup to complete..."
sleep 30

# Copy tracker files
echo ""
echo "Copying application files..."
scp -o StrictHostKeyChecking=no -i "$KEY_PATH" -r /workspaces/immiaccount/tracker/* "ubuntu@$PUBLIC_IP:/var/www/vevo-tracker/"

# Start the service
echo ""
echo "Starting application..."
ssh -o StrictHostKeyChecking=no -i "$KEY_PATH" "ubuntu@$PUBLIC_IP" << REMOTE
    cd /var/www/vevo-tracker
    npm install
    sudo systemctl start vevo-tracker
    sudo systemctl status vevo-tracker --no-pager
REMOTE

echo ""
echo "==================================="
echo "✓ DEPLOYMENT COMPLETE"
echo "==================================="
echo ""
echo "URL: http://$PUBLIC_IP/"
echo "Admin: http://$PUBLIC_IP/admin"
echo ""
echo "To connect via SSH:"
echo "  ssh -i $KEY_PATH ubuntu@$PUBLIC_IP"
echo ""
echo "To view logs:"
echo "  ssh -i $KEY_PATH ubuntu@$PUBLIC_IP 'sudo journalctl -u vevo-tracker -f'"
echo ""
echo "Key saved to: $KEY_PATH"
echo ""

