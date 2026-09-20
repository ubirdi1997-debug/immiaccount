#!/bin/bash
# Cloudflare DNS Setup - Just paste your token and run

# Check if token is provided
if [ -z "$1" ]; then
    echo "Usage: bash setup-dns.sh YOUR_API_TOKEN"
    echo ""
    echo "To get your API token:"
    echo "1. Go to https://dash.cloudflare.com/profile/api-tokens"
    echo "2. Click 'Create Token' → 'Custom token'"
    echo "3. Add permissions: Zone:Read, DNS:Edit"
    echo "4. Zone Resources: Include → Specific zone → usafe.in"
    echo "5. Create token and copy it"
    echo "6. Run: bash setup-dns.sh YOUR_COPIED_TOKEN"
    exit 1
fi

CF_API_TOKEN="$1"
EC2_IP="34.194.163.33"
DOMAIN="usafe.in"
SUBDOMAIN="vevo"

echo "Setting up DNS for $SUBDOMAIN.$DOMAIN → $EC2_IP"

# Get zone ID
echo "Finding zone..."
ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json")

ZONE_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result[0].id')

if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" = "null" ]; then
    echo "❌ Error: Could not find zone ID. Check your token permissions."
    echo "Response: $ZONE_RESPONSE"
    exit 1
fi

echo "✓ Zone ID: $ZONE_ID"

# Check if record already exists
echo "Checking existing records..."
EXISTING=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=$SUBDOMAIN.$DOMAIN" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.result[0].id')

if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ]; then
    echo "Record exists, updating..."
    METHOD="PUT"
    URL="https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$EXISTING"
else
    echo "Creating new record..."
    METHOD="POST"
    URL="https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records"
fi

# Create/Update DNS record
RESULT=$(curl -s -X "$METHOD" "$URL" \
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
    echo ""
    echo "✅ SUCCESS! DNS record created/updated."
    echo ""
    echo "Details:"
    echo "$RESULT" | jq -r '.result | "  Name: \(.name)
  Type: \(.type)
  IP: \(.content)
  Proxied: \(.proxied)
  TTL: \(.ttl)"'
    echo ""
    echo "Your application will be available at:"
    echo "  https://$SUBDOMAIN.$DOMAIN"
    echo ""
    echo "Note: DNS propagation may take a few minutes."
else
    echo "❌ Error creating DNS record:"
    echo "$RESULT" | jq -r '.errors[] | "  \(.code): \(.message)"'
    exit 1
fi
