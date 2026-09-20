#!/bin/bash
# Cloudflare DNS Setup for vevo.usafe.in

EC2_IP="34.194.163.33"
SUBDOMAIN="vevo"
DOMAIN="usafe.in"

echo "======================================"
echo "Cloudflare DNS Setup Required"
echo "======================================"
echo ""
echo "The Wrangler OAuth token doesn't have DNS API permissions."
echo ""
echo "To complete the DNS setup, you have two options:"
echo ""
echo "OPTION 1: Manual Setup (Easiest)"
echo "----------------------------------"
echo "1. Log in to Cloudflare Dashboard: https://dash.cloudflare.com"
echo "2. Select the 'usafe.in' domain"
echo "3. Go to DNS → Records"
echo "4. Click 'Add Record'"
echo "5. Configure:"
echo "   - Type: A"
echo "   - Name: vevo"
echo "   - IPv4 address: $EC2_IP"
echo "   - Proxy status: Proxied (orange cloud) ✓"
echo "   - TTL: Auto"
echo "6. Click 'Save'"
echo ""
echo "OPTION 2: API Token Setup"
echo "--------------------------"
echo "1. Go to Cloudflare Dashboard → My Profile → API Tokens"
echo "2. Create a new token with these permissions:"
echo "   - Zone:Read (for finding zone)"
echo "   - DNS:Edit (for managing records)"
echo "3. Set Zone Resources to: Include - Specific zone - usafe.in"
echo "4. Copy the token and run:"
echo "   export CF_API_TOKEN='your-token-here'"
echo "   bash /workspaces/immiaccount/cloudflare-dns-setup.sh"
echo ""
echo "======================================"
echo "Target Configuration:"
echo "  $SUBDOMAIN.$DOMAIN → $EC2_IP"
echo "======================================"

# If CF_API_TOKEN is set, try to create the record automatically
if [ -n "$CF_API_TOKEN" ]; then
    echo ""
    echo "API Token detected. Attempting automatic setup..."
    
    # Get zone ID
    ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" | jq -r '.result[0].id')
    
    if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "null" ]; then
        echo "❌ Could not find zone ID for $DOMAIN"
        exit 1
    fi
    
    echo "✓ Found zone ID: $ZONE_ID"
    
    # Create the DNS record
    RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
        -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"A\",
            \"name\": \"$SUBDOMAIN\",
            \"content\": \"$EC2_IP\",
            \"ttl\": 1,
            \"proxied\": true
        }")
    
    if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
        echo "✓ DNS record created successfully!"
        echo ""
        echo "Details:"
        echo "$RESULT" | jq -r '.result | "  Name: \(.name)\n  Type: \(.type)\n  Content: \(.content)\n  Proxied: \(.proxied)"'
    else
        echo "❌ Failed to create DNS record"
        echo "Error: $(echo "$RESULT" | jq -r '.errors[0].message')"
    fi
fi

echo ""
echo "Once DNS is configured, your application will be available at:"
echo "  https://vevo.usafe.in (Cloudflare proxied with SSL)"
echo ""
