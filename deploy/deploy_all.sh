#!/bin/bash

# Comprehensive Deployment Script for VEVO Application

# AWS Setup
echo "Starting AWS Lightsail setup..."
bash /workspaces/immiaccount/deploy/aws_setup.sh

# Cloudflare Setup (Using API)
echo "Setting up Cloudflare DNS record..."
bash /workspaces/immiaccount/deploy/cloudflare_dns_setup.sh

# Display final information
echo "\nDeployment completed!"
echo "Visit http://vevo.usafe.in/admin to access the admin panel"
echo "Default admin credentials:"
echo "Username: admin"
echo "Password: admin123"
