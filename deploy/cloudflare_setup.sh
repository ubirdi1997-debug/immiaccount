#!/bin/bash

# Cloudflare Setup Script

# Variables (Replace with your actual values)
CLOUDFLARE_EMAIL="your-email@example.com"
CLOUDFLARE_API_TOKEN="your-api-token"
ZONE_ID="your-zone-id"
SUBDOMAIN="vevo"
DOMAIN="usafe.in"
STATIC_IP="your-static-ip"

# Create DNS record for subdomain
# Using curl to interact with Cloudflare API
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
     -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
     -H "X-Auth-Key: $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{
         "type": "A",
         "name": "$SUBDOMAIN",
         "content": "$STATIC_IP",
         "ttl": 1,
         "proxied": true
     }'

# Display success message
echo "Cloudflare DNS record created successfully!"
echo "Visit http://$SUBDOMAIN.$DOMAIN to access the application"
