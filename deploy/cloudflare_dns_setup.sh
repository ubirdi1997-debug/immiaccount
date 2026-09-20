#!/bin/bash

# Cloudflare DNS Setup Script using API

# Variables (Using provided credentials)
CLOUDFLARE_EMAIL="your-email@example.com"
CLOUDFLARE_API_TOKEN="cfut_laAajxgtltp7L2TyqFsVM2zbAzGrByy5MNhX5bmf8385fb64"
ZONE_ID="794cffced38840e5c2a7c8fed26dcc4d"
SUBDOMAIN="vevo"
DOMAIN="usafe.in"

# Get static IP from command line argument or environment variable
if [ -z "$1" ]; then
    if [ -z "$STATIC_IP" ]; then
        read -p "Enter the static IP address: " STATIC_IP
    fi
else
    STATIC_IP="$1"
fi

# Create DNS record for subdomain
echo "Creating DNS record for $SUBDOMAIN.$DOMAIN..."

# Using curl to interact with Cloudflare API
response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
     -H "X-Auth-Key: $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{
         "type": "A",
         "name": "$SUBDOMAIN",
         "content": "$STATIC_IP",
         "ttl": 1,
         "proxied": true
     }')

# Check if the request was successful
if echo "$response" | grep -q '"success":true'; then
    echo "✅ Cloudflare DNS record created successfully!"
    echo "Visit http://$SUBDOMAIN.$DOMAIN to access the application"
else
    echo "❌ Failed to create Cloudflare DNS record."
    echo "Response:"
    echo "$response"
    exit 1
fi
