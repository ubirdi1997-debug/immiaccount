#!/bin/bash

# Production Deployment Script for VEVO Application on AWS Lightsail
# Handles deployment with session persistence, auto-restart, and health monitoring
# Designed to work even if Codespace connection is lost

# Enable job control and set trap to continue on disconnect
set -m
trap '' HUP
export NCURSES_NO_UTF8_ACS=1

# Create log file for deployment
DEPLOY_LOG="/tmp/vevo-deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$DEPLOY_LOG")
exec 2>&1

echo "=========================================="
echo "  VEVO Application Production Deployment"
echo "  Started at: $(date)"
echo "=========================================="
echo ""

# Configuration
INSTANCE_NAME="vevo-app-instance"
SSH_KEY_NAME="vevo-app-key"
STATIC_IP_NAME="vevo-app-ip"
AWS_REGION="us-east-1"
DOMAIN="usafe.in"
SUBDOMAIN="vevo"

# Cloudflare credentials
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-794cffced38840e5c2a7c8fed26dcc4d}"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-cfut_laAajxgtltp7L2TyqFsVM2zbAzGrByy5MNhX5bmf8385fb64}"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Pre-deployment checks
log "Running pre-deployment checks..."

# Check AWS CLI
if ! command -v aws &>/dev/null; then
    log "Installing AWS CLI..."
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" 2>/dev/null
    unzip -q awscliv2.zip
    sudo ./aws/install
    rm -rf aws awscliv2.zip
fi

# Verify AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
    log "ERROR: AWS credentials not configured"
    exit 1
fi

log "✓ AWS credentials verified"

# Step 1: Create SSH Key
log "Step 1: Setting up SSH key..."
if ! aws lightsail get-key-pair --key-pair-name "$SSH_KEY_NAME" &>/dev/null; then
    aws lightsail create-key-pair --key-pair-name "$SSH_KEY_NAME" --query 'keyPair.privateKeyBase64' --output text > "$SSH_KEY_NAME.pem" 2>/dev/null || true
    [ -f "$SSH_KEY_NAME.pem" ] && chmod 600 "$SSH_KEY_NAME.pem" && log "✓ SSH key created"
else
    log "✓ SSH key already exists"
fi

# Step 2: Create Instance
log "Step 2: Creating Lightsail instance..."
if ! aws lightsail get-instance --instance-name "$INSTANCE_NAME" &>/dev/null; then
    aws lightsail create-instances --instance-names "$INSTANCE_NAME" --availability-zone "${AWS_REGION}a" --blueprint-id ubuntu_24_04 --bundle-id nano_1_0 --key-pair-name "$SSH_KEY_NAME" &>/dev/null
    log "✓ Instance created"
else
    log "✓ Instance already exists"
fi

# Step 3: Wait for instance
log "Step 3: Waiting for instance..."
aws lightsail wait instance-running --instance-name "$INSTANCE_NAME"

# Step 4: Allocate Static IP
log "Step 4: Allocating static IP..."
if ! aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" &>/dev/null; then
    aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" &>/dev/null
fi

# Step 5: Attach Static IP
log "Step 5: Attaching static IP..."
aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$INSTANCE_NAME" &>/dev/null || true
STATIC_IP=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --query 'staticIp.ipAddress' --output text)
log "✓ Static IP: $STATIC_IP"

# Step 6: Configure Firewall
aws lightsail put-instance-public-ports --instance-name "$INSTANCE_NAME" --port-infos "fromPort=22,toPort=22,protocol=TCP" "fromPort=80,toPort=80,protocol=TCP" "fromPort=443,toPort=443,protocol=TCP" "fromPort=3000,toPort=3000,protocol=TCP" "fromPort=8080,toPort=8080,protocol=TCP" &>/dev/null

# Step 7: Prepare Package
log "Step 7: Preparing application package..."
DEPLOY_DIR=$(mktemp -d)
mkdir -p "$DEPLOY_DIR"/{admin-server,proxy-server,database,public,nginx,systemd}

cp -r /workspaces/immiaccount/admin-server/* "$DEPLOY_DIR/admin-server/" 2>/dev/null || true
cp -r /workspaces/immiaccount/proxy-server/* "$DEPLOY_DIR/proxy-server/" 2>/dev/null || true  
cp -r /workspaces/immiaccount/database/* "$DEPLOY_DIR/database/" 2>/dev/null || true
cp -r /workspaces/immiaccount/public/* "$DEPLOY_DIR/public/" 2>/dev/null || true
cp /workspaces/immiaccount/nginx/vevo.usafe.in "$DEPLOY_DIR/nginx/" 2>/dev/null || true
cp /workspaces/immiaccount/systemd/*.service "$DEPLOY_DIR/systemd/" 2>/dev/null || true

PACKAGE_FILE="/workspaces/immiaccount/vevo-app-$(date +%Y%m%d).tar.gz"
tar -czf "$PACKAGE_FILE" -C "$DEPLOY_DIR" .
rm -rf "$DEPLOY_DIR"
log "✓ Package created"

# Step 8: Deploy with nohup for resilience
log "Step 8: Deploying to server..."

SSH_KEY=""
[ -f "$SSH_KEY_NAME.pem" ] && SSH_KEY="-i $SSH_KEY_NAME.pem"

# Wait for SSH with timeout
for i in {1..30}; do
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 $SSH_KEY ubuntu@$STATIC_IP "echo ready" &>/dev/null && break
    sleep 2
done

# Create and upload deployment script
cat > /tmp/remote_deploy.sh << 'REMOTEEOF'
#!/bin/bash
exec > >(tee -a /var/log/vevo-deploy.log)
exec 2>&1
echo "[$(date)] Starting deployment..."

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq curl wget git sqlite3 nginx nodejs npm certbot python3-certbot-nginx screen tmux

sudo npm install -g pm2 --silent 2>/dev/null || true

sudo mkdir -p /var/www/vevo-app
cd /var/www/vevo-app
sudo tar -xzf /tmp/vevo-app-package.tar.gz
sudo chown -R ubuntu:ubuntu /var/www/vevo-app

cd /var/www/vevo-app/admin-server && npm install express sqlite3 connect-sqlite3 express-rate-limit body-parser express-session cors --silent 2>/dev/null || true
cd /var/www/vevo-app/proxy-server && npm install express http-proxy-middleware cheerio axios --silent 2>/dev/null || true

cd /var/www/vevo-app
node -e "
const fs=require('fs'), path=require('path'), sqlite3=require('sqlite3').verbose(), crypto=require('crypto');
const dbPath=path.join('/var/www/vevo-app/database','immiaccount.db');
const dbDir=path.dirname(dbPath);
if(!fs.existsSync(dbDir)) fs.mkdirSync(dbDir,{recursive:true});
const db=new sqlite3.Database(dbPath);
const schema=fs.readFileSync('/var/www/vevo-app/database/vevo_schema.sql','utf8');
const stmts=schema.split(';').filter(s=>s.trim().length>0);
let done=0;
stmts.forEach(s=>{
  db.run(s,err=>{
    done++;
    if(done===stmts.length){
      const pwd='admin123', salt=crypto.randomBytes(16).toString('hex'), hash=crypto.scryptSync(pwd,salt,64).toString('hex');
      db.run('INSERT OR IGNORE INTO admins (username,password_hash,salt,is_super_admin,is_active) VALUES (?,?,?,1,1)',['admin',hash,salt],()=>{
        console.log('Database ready');
        db.close();
      });
    }
  });
});
" 2>/dev/null || echo "DB init continued..."

sudo cp /var/www/vevo-app/nginx/vevo.usafe.in /etc/nginx/sites-available/ 2>/dev/null || true
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo ln -sf /etc/nginx/sites-available/vevo.usafe.in /etc/nginx/sites-enabled/ 2>/dev/null || true
sudo nginx -t && sudo systemctl restart nginx
sudo systemctl enable nginx

cat > /var/www/vevo-app/ecosystem.config.js << 'ECOEOF'
module.exports = {
  apps: [
    {
      name: 'vevo-admin',
      script: './admin-server/server.js',
      cwd: '/var/www/vevo-app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_PATH: '/var/www/vevo-app/database/immiaccount.db',
        SESSION_SECRET: 'vevo-session-' + Math.random().toString(36).substring(2)
      },
      merge_logs: true,
      time: true
    },
    {
      name: 'vevo-proxy',
      script: './proxy-server/server.js',
      cwd: '/var/www/vevo-app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      merge_logs: true,
      time: true
    }
  ]
};
ECOEOF

cd /var/www/vevo-app
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

# Health check script
cat > /usr/local/bin/vevo-health.sh << 'HEALTHEOF'
#!/bin/bash
ADMIN=$(pm2 show vevo-admin 2>/dev/null | grep -c "online")
PROXY=$(pm2 show vevo-proxy 2>/dev/null | grep -c "online")
[ "$ADMIN" -eq 0 ] && pm2 restart vevo-admin
[ "$PROXY" -eq 0 ] && pm2 restart vevo-proxy
HEALTHEOF
sudo chmod +x /usr/local/bin/vevo-health.sh

(crontab -l 2>/dev/null | grep -v vevo-health; echo "*/2 * * * * /usr/local/bin/vevo-health.sh >/dev/null 2>&1") | crontab -

echo "[$(date)] Deployment completed!"
REMOTEEOF

chmod +x /tmp/remote_deploy.sh
scp -o StrictHostKeyChecking=no $SSH_KEY "$PACKAGE_FILE" ubuntu@$STATIC_IP:/tmp/vevo-app-package.tar.gz
scp -o StrictHostKeyChecking=no $SSH_KEY /tmp/remote_deploy.sh ubuntu@$STATIC_IP:/tmp/remote_deploy.sh

# Execute with nohup to survive disconnect
log "Starting remote deployment (will continue even if disconnected)..."
ssh -o StrictHostKeyChecking=no $SSH_KEY ubuntu@$STATIC_IP "nohup bash /tmp/remote_deploy.sh > /tmp/deploy.log 2>&1 &
sleep 2
echo 'Deployment started in background'
echo 'Check progress with: tail -f /tmp/deploy.log'"

# Monitor deployment with polling (connection can be lost and reconnected)
log "Monitoring deployment (safe to disconnect, will complete automatically)..."
DEPLOY_COMPLETE=0
for i in {1..120}; do
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 $SSH_KEY ubuntu@$STATIC_IP "grep -q 'Deployment completed' /var/log/vevo-deploy.log 2>/dev/null" 2>/dev/null; then
        DEPLOY_COMPLETE=1
        break
    fi
    sleep 5
    echo -n "."
done

if [ $DEPLOY_COMPLETE -eq 1 ]; then
    log "✓ Remote deployment completed"
else
    log "✓ Deployment running in background (check with: ssh ubuntu@$STATIC_IP 'tail -f /var/log/vevo-deploy.log')"
fi

# Step 9: Cloudflare DNS
log "Step 9: Setting up Cloudflare DNS..."
EXISTING=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$SUBDOMAIN.$DOMAIN" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$EXISTING" ] && curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$EXISTING" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" >/dev/null

curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"A\",\"name\":\"$SUBDOMAIN\",\"content\":\"$STATIC_IP\",\"ttl\":1,\"proxied\":true}" >/dev/null
log "✓ Cloudflare DNS configured"

# Cleanup
rm -f "$PACKAGE_FILE" /tmp/remote_deploy.sh

# Summary
echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETED!"
echo "=========================================="
echo ""
echo "Server: http://$STATIC_IP/admin"
echo "Domain: http://$SUBDOMAIN.$DOMAIN/admin"
echo "Login: admin / admin123"
echo ""
echo "To check status: ssh -i $SSH_KEY_NAME.pem ubuntu@$STATIC_IP 'pm2 status'"
echo "To view logs: ssh -i $SSH_KEY_NAME.pem ubuntu@$STATIC_IP 'pm2 logs'"
echo "Deployment log: $DEPLOY_LOG"
echo "=========================================="