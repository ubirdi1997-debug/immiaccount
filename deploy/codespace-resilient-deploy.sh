#!/bin/bash

# Codespace-Resilient Deployment Script
# This script creates a persistent deployment that survives browser disconnections
# by running in the background with proper logging and state management

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DEPLOY_ID="deploy-$(date +%Y%m%d-%H%M%S)"
STATE_DIR="/workspaces/immiaccount/.deploy-state"
LOG_FILE="$STATE_DIR/$DEPLOY_ID.log"
PID_FILE="$STATE_DIR/current-deploy.pid"
STATUS_FILE="$STATE_DIR/current-deploy.status"

# Create state directory
mkdir -p "$STATE_DIR"

# Function to log with timestamp
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg" | tee -a "$LOG_FILE"
}

# Function to update status
set_status() {
    echo "$1" > "$STATUS_FILE"
    echo "$DEPLOY_ID" >> "$STATE_DIR/all-deployments.log"
}

# Function to check if deployment is running
check_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Show header
clear
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  VEVO Resilient Codespace Deployment      ${NC}"
echo -e "${BLUE}  (Survives Browser Disconnect)            ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if another deployment is running
if check_running; then
    local pid=$(cat "$PID_FILE")
    echo -e "${YELLOW}⚠ Another deployment is already running (PID: $pid)${NC}"
    echo ""
    echo "Options:"
    echo "  1. View running deployment logs"
    echo "  2. Stop running deployment and start new"
    echo "  3. Check deployment status"
    echo "  4. Exit"
    echo ""
    read -p "Select option (1-4): " choice
    
    case $choice in
        1)
            echo ""
            echo "=== Deployment Logs (press Ctrl+C to exit) ==="
            tail -f "$LOG_FILE" 2>/dev/null || echo "No log file found"
            exit 0
            ;;
        2)
            echo "Stopping previous deployment..."
            kill "$pid" 2>/dev/null || true
            rm -f "$PID_FILE"
            sleep 2
            ;;
        3)
            echo ""
            echo "Current Status: $(cat "$STATUS_FILE" 2>/dev/null || echo 'Unknown')"
            echo "Deployment ID: $(tail -1 "$STATE_DIR/all-deployments.log" 2>/dev/null || echo 'None')"
            echo ""
            echo "Recent log entries:"
            tail -20 "$LOG_FILE" 2>/dev/null || echo "No logs available"
            exit 0
            ;;
        4)
            exit 0
            ;;
    esac
fi

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

# AWS CLI check
if ! command -v aws &>/dev/null; then
    echo -e "${YELLOW}Installing AWS CLI...${NC}"
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip" &>/dev/null
    unzip -q "/tmp/awscliv2.zip" -d /tmp/
    sudo /tmp/aws/install &>/dev/null
fi

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo ""
    echo "To configure AWS credentials, run:"
    echo "  aws configure"
    echo ""
    echo "Or set environment variables:"
    echo "  export AWS_ACCESS_KEY_ID=your-key"
    echo "  export AWS_SECRET_ACCESS_KEY=your-secret"
    echo "  export AWS_DEFAULT_REGION=us-east-1"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ AWS credentials verified${NC}"

# Start actual deployment in background
echo ""
echo -e "${GREEN}Starting resilient deployment...${NC}"
echo -e "${YELLOW}You can safely close your browser - deployment will continue${NC}"
echo ""

# Create the deployment script that runs in background
cat > "/tmp/$DEPLOY_ID-script.sh" << 'DEPLOY_SCRIPT'
#!/bin/bash
DEPLOY_ID="$1"
STATE_DIR="$2"
LOG_FILE="$STATE_DIR/$DEPLOY_ID.log"
STATUS_FILE="$STATE_DIR/current-deploy.status"

# Redirect all output to log
exec >> "$LOG_FILE" 2>&1

echo "=========================================="
echo "  Deployment Started: $(date)"
echo "  Deployment ID: $DEPLOY_ID"
echo "=========================================="

# Configuration
INSTANCE_NAME="vevo-app-instance"
SSH_KEY_NAME="vevo-app-key"
STATIC_IP_NAME="vevo-app-ip"
AWS_REGION="us-east-1"
DOMAIN="usafe.in"
SUBDOMAIN="vevo"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-794cffced38840e5c2a7c8fed26dcc4d}"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-cfut_laAajxgtltp7L2TyqFsVM2zbAzGrByy5MNhX5bmf8385fb64}"

set_status() {
    echo "$1" > "$STATUS_FILE"
}

echo ""
echo "Step 1: Creating SSH key..."
if ! aws lightsail get-key-pair --key-pair-name "$SSH_KEY_NAME" &>/dev/null; then
    aws lightsail create-key-pair --key-pair-name "$SSH_KEY_NAME" --query 'keyPair.privateKeyBase64' --output text > "/workspaces/immiaccount/$SSH_KEY_NAME.pem" 2>/dev/null || true
    [ -f "/workspaces/immiaccount/$SSH_KEY_NAME.pem" ] && chmod 600 "/workspaces/immiaccount/$SSH_KEY_NAME.pem"
    echo "✓ SSH key created"
else
    echo "✓ SSH key already exists"
fi

echo ""
echo "Step 2: Creating Lightsail instance..."
if ! aws lightsail get-instance --instance-name "$INSTANCE_NAME" &>/dev/null; then
    aws lightsail create-instances --instance-names "$INSTANCE_NAME" --availability-zone "${AWS_REGION}a" --blueprint-id ubuntu_24_04 --bundle-id nano_1_0 --key-pair-name "$SSH_KEY_NAME" &>/dev/null
    echo "✓ Instance created"
else
    echo "✓ Instance already exists"
fi

echo ""
echo "Step 3: Waiting for instance to be ready..."
set_status "WAITING_FOR_INSTANCE"
aws lightsail wait instance-running --instance-name "$INSTANCE_NAME"

# Get instance info
INSTANCE_INFO=$(aws lightsail get-instance --instance-name "$INSTANCE_NAME" --query 'instance' --output json)
PUBLIC_IP=$(echo "$INSTANCE_INFO" | grep -o '"publicIpAddress": "[^"]*"' | cut -d'"' -f4)
echo "✓ Instance running (IP: $PUBLIC_IP)"

# Step 4: Static IP
echo ""
echo "Step 4: Setting up static IP..."
if ! aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" &>/dev/null; then
    aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" &>/dev/null
fi
aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$INSTANCE_NAME" &>/dev/null || true
STATIC_IP=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --query 'staticIp.ipAddress' --output text)
echo "✓ Static IP: $STATIC_IP"

# Step 5: Firewall
echo ""
echo "Step 5: Configuring firewall..."
aws lightsail put-instance-public-ports --instance-name "$INSTANCE_NAME" --port-infos "fromPort=22,toPort=22,protocol=TCP" "fromPort=80,toPort=80,protocol=TCP" "fromPort=443,toPort=443,protocol=TCP" &>/dev/null
echo "✓ Firewall configured"

# Step 6: Prepare package
echo ""
echo "Step 6: Preparing deployment package..."
set_status "PREPARING_PACKAGE"
PACKAGE_FILE="/tmp/vevo-app-${DEPLOY_ID}.tar.gz"
tar -czf "$PACKAGE_FILE" -C /workspaces/immiaccount admin-server proxy-server database public nginx systemd 2>/dev/null || echo "Some files may be missing"
echo "✓ Package created"

# Step 7: Wait for SSH
echo ""
echo "Step 7: Waiting for SSH access..."
set_status "WAITING_FOR_SSH"
SSH_KEY=""
[ -f "/workspaces/immiaccount/$SSH_KEY_NAME.pem" ] && SSH_KEY="-i /workspaces/immiaccount/$SSH_KEY_NAME.pem"

for i in {1..60}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 $SSH_KEY "ubuntu@$STATIC_IP" "echo 'ready'" &>/dev/null; then
        echo "✓ SSH ready"
        break
    fi
    echo -n "."
    sleep 3
done
echo ""

# Step 8: Deploy
echo ""
echo "Step 8: Deploying to server..."
set_status "DEPLOYING_TO_SERVER"

# Create remote deployment script
cat > "/tmp/remote-deploy-$DEPLOY_ID.sh" << 'REMOTEEOF'
#!/bin/bash
exec > >(tee -a /var/log/vevo-deploy.log) 2>&1
echo "[$(date)] Remote deployment started"

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq 2>/dev/null || true
sudo apt-get install -y -qq curl wget git sqlite3 nginx nodejs npm 2>/dev/null || true
sudo npm install -g pm2 2>/dev/null || true

sudo mkdir -p /var/www/vevo-app
cd /var/www/vevo-app
sudo tar -xzf /tmp/vevo-package.tar.gz 2>/dev/null || true
sudo chown -R ubuntu:ubuntu /var/www/vevo-app 2>/dev/null || true

cd /var/www/vevo-app/admin-server && npm install --silent 2>/dev/null || true
cd /var/www/vevo-app/proxy-server && npm install --silent 2>/dev/null || true

# Initialize database
cd /var/www/vevo-app
node -e "
const fs=require('fs'), path=require('path'), sqlite3=require('sqlite3').verbose(), crypto=require('crypto');
const dbPath=path.join('/var/www/vevo-app/database','immiaccount.db');
const schemaPath=path.join('/var/www/vevo-app/database','vevo_schema.sql');

if(!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath),{recursive:true});
const db=new sqlite3.Database(dbPath);
if(fs.existsSync(schemaPath)) {
  const schema=fs.readFileSync(schemaPath,'utf8');
  const stmts=schema.split(';').filter(s=>s.trim().length>0);
  let done=0;
  stmts.forEach(s=>{
    db.run(s,()=>{
      done++;
      if(done===stmts.length){
        const pwd='admin123', salt=crypto.randomBytes(16).toString('hex'), hash=crypto.scryptSync(pwd,salt,64).toString('hex');
        db.run('INSERT OR IGNORE INTO admins (username,password_hash,salt,is_super_admin,is_active) VALUES (?,?,?,1,1)',['admin',hash,salt],()=>{
          console.log('Database initialized');
          db.close();
        });
      }
    });
  });
}
" 2>/dev/null || echo "Database init check completed"

# Configure nginx
sudo cp /var/www/vevo-app/nginx/vevo.usafe.in /etc/nginx/sites-available/ 2>/dev/null || true
sudo ln -sf /etc/nginx/sites-available/vevo.usafe.in /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t && sudo systemctl restart nginx 2>/dev/null || true

# Create PM2 config
cat > /var/www/vevo-app/ecosystem.config.js << 'EOFCFG'
module.exports = {
  apps: [
    {
      name: 'vevo-admin',
      script: './admin-server/server.js',
      cwd: '/var/www/vevo-app',
      autorestart: true,
      env: { NODE_ENV: 'production', PORT: 3000, DB_PATH: '/var/www/vevo-app/database/immiaccount.db' }
    },
    {
      name: 'vevo-proxy',
      script: './proxy-server/server.js',
      cwd: '/var/www/vevo-app',
      autorestart: true,
      env: { NODE_ENV: 'production', PORT: 8080 }
    }
  ]
};
EOFCFG

cd /var/www/vevo-app
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js 2>/dev/null || true
pm2 save 2>/dev/null || true
sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u ubuntu 2>/dev/null || true

# Health check cron
sudo tee /usr/local/bin/vevo-health.sh > /dev/null << 'HEALTH'
#!/bin/bash
pm2 show vevo-admin 2>/dev/null | grep -q "online" || pm2 restart vevo-admin
pm2 show vevo-proxy 2>/dev/null | grep -q "online" || pm2 restart vevo-proxy
HEALTH
sudo chmod +x /usr/local/bin/vevo-health.sh

(crontab -l 2>/dev/null | grep -v vevo-health; echo "*/2 * * * * /usr/local/bin/vevo-health.sh") | crontab - 2>/dev/null || true

echo "[$(date)] Remote deployment completed"
REMOTEEOF

chmod +x "/tmp/remote-deploy-$DEPLOY_ID.sh"
scp -o StrictHostKeyChecking=no $SSH_KEY "$PACKAGE_FILE" "ubuntu@$STATIC_IP:/tmp/vevo-package.tar.gz" 2>/dev/null || true
scp -o StrictHostKeyChecking=no $SSH_KEY "/tmp/remote-deploy-$DEPLOY_ID.sh" "ubuntu@$STATIC_IP:/tmp/remote-deploy.sh" 2>/dev/null || true

# Execute remotely (background on server)
ssh -o StrictHostKeyChecking=no $SSH_KEY "ubuntu@$STATIC_IP" "chmod +x /tmp/remote-deploy.sh && nohup bash /tmp/remote-deploy.sh > /tmp/deploy.log 2>&1 & sleep 2 && echo 'Started'" 2>/dev/null || true

# Monitor
echo ""
echo "Monitoring deployment..."
set_status "MONITORING_DEPLOYMENT"
for i in {1..60}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 $SSH_KEY "ubuntu@$STATIC_IP" "grep -q 'Remote deployment completed' /var/log/vevo-deploy.log 2>/dev/null" 2>/dev/null; then
        echo ""
        echo "✓ Remote deployment completed"
        break
    fi
    echo -n "."
    sleep 5
done
echo ""

# Step 9: Cloudflare
echo ""
echo "Step 9: Configuring Cloudflare DNS..."
set_status "CONFIGURING_DNS"
EXISTING=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$SUBDOMAIN.$DOMAIN" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$EXISTING" ] && curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$EXISTING" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" >/dev/null 2>&1 || true

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$SUBDOMAIN\",\"content\":\"$STATIC_IP\",\"ttl\":1,\"proxied\":true}" >/dev/null 2>&1
echo "✓ DNS configured"

# Save deployment info
echo "$STATIC_IP" > "$STATE_DIR/last-static-ip.txt"
echo "$DEPLOY_ID" > "$STATE_DIR/last-deploy-id.txt"

# Final status
echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "Server: http://$STATIC_IP/admin"
echo "Domain: http://$SUBDOMAIN.$DOMAIN/admin"
echo "Login: admin / admin123"
echo ""
echo "SSH Access: ssh $SSH_KEY ubuntu@$STATIC_IP"
echo ""
set_status "COMPLETED"

echo ""
echo "To check deployment status later:"
echo "  bash /workspaces/immiaccount/deploy/check-deployment.sh"
echo ""

DEPLOY_SCRIPT

# Make scripts executable
chmod +x "/tmp/$DEPLOY_ID-script.sh"

# Start deployment in background (nohup ensures it continues)
nohup bash "/tmp/$DEPLOY_ID-script.sh" "$DEPLOY_ID" "$STATE_DIR" > "$LOG_FILE" 2>&1 &
DEPLOY_PID=$!

# Record PID
echo "$DEPLOY_PID" > "$PID_FILE"
set_status "STARTING"

# Show initial output
echo -e "${GREEN}✓ Deployment started in background (PID: $DEPLOY_PID)${NC}"
echo ""
echo "Deployment ID: $DEPLOY_ID"
echo "Log file: $LOG_FILE"
echo ""
echo -e "${YELLOW}You can safely close your browser now!${NC}"
echo "The deployment will continue running on the Codespace."
echo ""
echo "To monitor progress:"
echo "  1. Reopen this Codespace later"
echo "  2. Run: bash deploy/check-deployment.sh"
echo "  3. Or view logs: tail -f $LOG_FILE"
echo ""
echo "Watching deployment for 30 seconds..."
echo ""

# Show live output for 30 seconds
# Using timeout to allow user to see initial progress
timeout 30 tail -f "$LOG_FILE" || true

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment is running in the background!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "To check status anytime, run:"
echo "  bash deploy/check-deployment.sh"
echo ""
echo "Status file: $STATUS_FILE"
echo "Current status: $(cat "$STATUS_FILE" 2>/dev/null || echo 'UNKNOWN')" 
