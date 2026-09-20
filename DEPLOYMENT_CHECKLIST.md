# Pre-Deployment Checklist

## Prerequisites Checklist

Before running the deployment, ensure the following are in place:

### 1. AWS Account Setup
- [ ] AWS account created and active
- [ ] AWS CLI installed locally: `aws --version`
- [ ] AWS credentials configured: `aws configure`
- [ ] IAM user with Lightsail permissions created
- [ ] AWS Access Key ID configured
- [ ] AWS Secret Access Key configured
- [ ] Default region set to `us-east-1`

### 2. Cloudflare Account Setup
- [ ] Cloudflare account created
- [ ] Domain `usafe.in` added to Cloudflare
- [ ] Zone ID obtained: `794cffced38840e5c2a7c8fed26dcc4d`
- [ ] API Token generated: `cfut_laAajxgtltp7L2TyqFsVM2zbAzGrByy5MNhX5bmf8385fb64`
- [ ] DNS propagation ready (may take 1-48 hours after deployment)

### 3. Local Environment
- [ ] Node.js installed locally (for development/testing)
- [ ] Git repository cloned/checked out
- [ ] All code changes committed and pushed

### 4. Application Components Verified

#### Database Schema
- [ ] `/database/vevo_schema.sql` exists with all required tables:
  - `admins` table with browser locking fields
  - `admin_login_attempts` table
  - `admin_sessions` table
  - `admin_machine_locks` table
  - `visa_applications` table
  - `audit_logs` table

#### Admin Server
- [ ] `/admin-server/server.js` exists and includes:
  - Super admin routes mounted
  - Browser lock middleware
  - Login with machine verification
  - Session management
- [ ] `/admin-server/routes/superAdmin.js` exists
- [ ] `/admin-server/middleware/browserLock.js` exists

#### Proxy Server
- [ ] `/proxy-server/server.js` exists and is configured

#### Public Files
- [ ] `/public/login.html` exists with Tailwind CSS
- [ ] `/public/admin/dashboard.html` exists
- [ ] `/public/admin/super-admin.html` exists
- [ ] `/public/admin/blocked.html` exists
- [ ] `/public/admin/security-logs.html` exists

#### Nginx Config
- [ ] `/nginx/vevo.usafe.in` exists with proper proxy rules

### 5. Security Configuration
- [ ] Default admin password changed from `admin123` after deployment
- [ ] Session secret changed from default in production
- [ ] HTTPS/SSL to be configured (using Cloudflare or Let's Encrypt)

### 6. Cost Verification
- [ ] AWS Lightsail instance: ~$3.50/month
- [ ] Cloudflare Free Plan: $0
- [ ] Total monthly cost confirmed

## Deployment Steps

1. **Run the deployment script:**
   ```bash
   cd /workspaces/immiaccount
   bash deploy/production_deploy.sh
   ```

2. **Monitor the deployment output** for any errors

3. **Wait for DNS propagation** (can take up to 48 hours, usually 5 minutes with Cloudflare)

4. **Test the deployment:**
   - Visit `http://YOUR_STATIC_IP/admin`
   - Or `http://vevo.usafe.in/admin` (after DNS propagates)

5. **Log in with default credentials:**
   - Username: `admin`
   - Password: `admin123`

6. **Complete first-time setup:**
   - Change default password
   - Verify Super Admin panel is accessible at `/admin/super-admin`
   - Create additional admins if needed

## Post-Deployment Verification

- [ ] Admin login page loads correctly
- [ ] Browser/machine locking works on first login
- [ ] Super Admin dashboard accessible
- [ ] Security logs showing correctly
- [ ] Nginx proxy configuration working
- [ ] HTTPS redirect configured (if using Cloudflare SSL)

## Troubleshooting

If deployment fails:

1. Check AWS Lightsail instance status:
   ```bash
   aws lightsail get-instance --instance-name vevo-app-instance
   ```

2. Check SSH connectivity:
   ```bash
   ssh -i vevo-app-key.pem ubuntu@YOUR_STATIC_IP
   ```

3. Check application logs on server:
   ```bash
   ssh ubuntu@YOUR_STATIC_IP 'sudo pm2 logs'
   ```

4. Check Nginx status:
   ```bash
   ssh ubuntu@YOUR_STATIC_IP 'sudo systemctl status nginx'
   ```

5. Check database:
   ```bash
   ssh ubuntu@YOUR_STATIC_IP 'sqlite3 /var/www/vevo-app/database/immiaccount.db "SELECT * FROM admins;"'
   ```