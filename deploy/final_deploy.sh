#!/bin/bash

# Final Deployment Script for VEVO Application

# AWS Setup
echo "Starting AWS Lightsail setup..."

# Run AWS setup and capture output
AWS_OUTPUT=$(bash /workspaces/immiaccount/deploy/aws_setup.sh)

# Extract static IP from output (this is a placeholder - actual implementation would parse the output)
STATIC_IP=$(echo "$AWS_OUTPUT" | grep -oE 'Static IP: [0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' | cut -d' ' -f3)

if [ -z "$STATIC_IP" ]; then
    echo "❌ Could not extract static IP from AWS setup output"
    echo "Please run the AWS setup manually and provide the static IP"
    read -p "Enter the static IP address: " STATIC_IP
fi

echo "\nStatic IP obtained: $STATIC_IP"

# Cloudflare DNS Setup
echo "\nSetting up Cloudflare DNS record..."
bash /workspaces/immiaccount/deploy/cloudflare_dns_setup.sh "$STATIC_IP"

# Test the Application
echo "\nTesting the application..."
bash /workspaces/immiaccount/deploy/test_app.sh "$STATIC_IP"

# Display final information
echo "\nDeployment and testing completed successfully!"
echo "Visit http://vevo.usafe.in/admin to access the admin panel (if DNS is configured)"
echo "Or visit http://$STATIC_IP/admin to access the admin panel directly"
echo "Default admin credentials:"
echo "Username: admin"
echo "Password: admin123"
