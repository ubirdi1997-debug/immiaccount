#!/bin/bash

# Test Script for VEVO Application

# Variables

# Get static IP from command line argument or environment variable
if [ -z "$1" ]; then
    if [ -z "$STATIC_IP" ]; then
        read -p "Enter the static IP address: " STATIC_IP
    fi
else
    STATIC_IP="$1"
fi

# Test Admin Login
echo "Testing Admin Login..."

curl -s -X POST "http://$STATIC_IP/login" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     --data 'username=admin&password=admin123' \
     -c cookies.txt

# Check if login was successful
if grep -q "Set-Cookie: connect.sid" cookies.txt; then
    echo "✅ Admin login successful"
else
    echo "❌ Admin login failed"
    exit 1
fi

# Test Creating a Visa Application
echo "\nTesting Creating Visa Application..."

curl -s -X POST "http://$STATIC_IP/admin/api/applications" \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     --data '{
         "reference_type": "TRN",
         "reference_number": "TRN-2026-000001",
         "passport_number": "A1234567",
         "country_of_passport": "INDIA",
         "date_of_birth": "01/01/1990",
         "given_names": "John",
         "family_name": "Doe",
         "visa_class_subclass": "Student (subclass 500)",
         "visa_description": "Higher Education Sector",
         "visa_applicant_status": "Primary",
         "visa_status": "Approved",
         "grant_date": "15 January 2025",
         "expiry_date": "15 January 2029",
         "period_of_stay": "Until Visa Expiry",
         "entries_allowed": "Multiple",
         "work_entitlements": "[\"8105 - Work limitation (48 hours per fortnight during study session)\"]",
         "study_entitlements": "[\"8202 - Meet course requirements\"]",
         "other_conditions": "[\"8501 - Maintain adequate health insurance\"]"
     }'

# Test VEVO Proxy Functionality
echo "\nTesting VEVO Proxy Functionality..."

curl -s "http://$STATIC_IP/evo/firstParty?actionType=query&passportNumber=A1234567&referenceNumber=TRN-2026-000001&dob=01/01/1990"

# Display success message
echo "\nTesting completed!"
echo "Visit http://$STATIC_IP/admin to access the admin panel"
echo "Default admin credentials:"
echo "Username: admin"
echo "Password: admin123"
