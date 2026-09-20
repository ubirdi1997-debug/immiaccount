# Deployment Instructions

## 1. Install Dependencies

```bash
# Install Node.js and npm
sudo apt update
sudo apt install nodejs npm

# Install SQLite3
sudo apt install sqlite3

# Install Nginx
sudo apt install nginx
```

## 2. Set Up Swap File (Required for 512MB RAM)

```bash
# Create 1GB swap file
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap file permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Deploy the Application

```bash
# Create the deployment directory
sudo mkdir -p /var/www/vevo-app

# Copy the application files
sudo cp -r /workspaces/immiaccount/admin-server/* /var/www/vevo-app/
sudo cp -r /workspaces/immiaccount/proxy-server/* /var/www/vevo-app/
sudo cp -r /workspaces/immiaccount/public/* /var/www/vevo-app/public/

# Install dependencies
cd /var/www/vevo-app
npm install

# Set up database
mkdir -p /var/www/vevo-app/database

# Copy the database schema
cp /workspaces/immiaccount/database/vevo_schema.sql /var/www/vevo-app/database/

# Initialize the database
sqlite3 /var/www/vevo-app/database/app.db < /var/www/vevo-app/database/vevo_schema.sql
```

## 4. Configure Nginx

```bash
# Copy the Nginx configuration
sudo cp /workspaces/immiaccount/nginx/vevo.usafe.in /etc/nginx/sites-available/

# Enable the site
sudo ln -s /etc/nginx/sites-available/vevo.usafe.in /etc/nginx/sites-enabled/

# Test the configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## 5. Set Up Systemd Services

```bash
# Copy the service files
sudo cp /workspaces/immiaccount/systemd/vevo-admin.service /etc/systemd/system/
sudo cp /workspaces/immiaccount/systemd/vevo-proxy.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start services
sudo systemctl enable --now vevo-admin vevo-proxy
```

## 6. Configure Cloudflare

1. Go to your Cloudflare dashboard
2. Add an A Record for `vevo` pointing to your AWS Lightsail Static IP with Proxy Status set to Proxied (Orange Cloud)
3. Set SSL/TLS Encryption Mode to Full or Flexible

## 7. Final Verification

1. Check that both services are running:
   ```bash
   sudo systemctl status vevo-admin vevo-proxy
   ```
2. Test the application by visiting `http://vevo.usafe.in` in your browser
3. Log in to the admin panel at `http://vevo.usafe.in/admin`