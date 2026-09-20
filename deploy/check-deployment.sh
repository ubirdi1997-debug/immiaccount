#!/bin/bash

# Check deployment status - run this after reconnecting to Codespace
# to see the status of your background deployment

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="/workspaces/immiaccount/.deploy-state"

echo "=========================================="
echo "  VEVO Deployment Status Checker"
echo "=========================================="
echo ""

# Check if state directory exists
if [ ! -d "$STATE_DIR" ]; then
    echo "No deployment state found."
    echo ""
    echo "To start a deployment run:"
    echo "  bash deploy/codespace-resilient-deploy.sh"
    exit 1
fi

# Show all deployments
echo "Deployments:"
if [ -f "$STATE_DIR/all-deployments.log" ]; then
    tail -10 "$STATE_DIR/all-deployments.log" | nl
else
    echo "  No deployments found"
fi
echo ""

# Check current deployment
if [ -f "$STATE_DIR/current-deploy.pid" ]; then
    PID=$(cat "$STATE_DIR/current-deploy.pid")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "✓ Deployment is RUNNING (PID: $PID)"
    else
        echo "✗ Deployment process has completed"
    fi
else
    echo "ℹ No active deployment found"
fi
echo ""

if [ -f "$STATE_DIR/current-deploy.status" ]; then
    STATUS=$(cat "$STATE_DIR/current-deploy.status")
    echo "Current Status: $STATUS"
else
    echo "Status: UNKNOWN"
fi
echo ""

if [ -f "$STATE_DIR/last-static-ip.txt" ]; then
    STATIC_IP=$(cat "$STATE_DIR/last-static-ip.txt")
    echo "Last Deployed Server: http://$STATIC_IP/admin"
fi
echo ""

# Show recent logs
if [ -f "$STATE_DIR/current-deploy.pid" ]; then
    CURRENT_PID=$(cat "$STATE_DIR/current-deploy.pid")
    if [ -f "/proc/$CURRENT_PID/fd/1" ]; then
        # Find the log file
        LOG_FILE=$(ls -t "$STATE_DIR"/*.log 2>/dev/null | head -1)
        if [ -n "$LOG_FILE" ]; then
            echo "Recent log entries:"
            echo "---"
            tail -50 "$LOG_FILE" 2>/dev/null || echo "No recent logs"
            echo "---"
            echo ""
            read -p "View full logs? (y/n): " view_logs
            if [ "$view_logs" = "y" ]; then
                tail -f "$LOG_FILE"
            fi
        fi
    fi
fi

echo ""
echo "Commands you can run:"
echo "  tail -f $STATE_DIR/*.log    - Watch deployment logs"
echo "  bash deploy/codespace-resilient-deploy.sh  - Start new deployment"
echo ""