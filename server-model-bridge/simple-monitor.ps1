#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

# Load environment
$envPath = Join-Path $PSScriptRoot '../../.env'
$values = @{}
if (Test-Path $envPath) {
    Get-Content $envPath | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $values[$parts[0]] = $parts[1].Trim('"')
    }
}

function Start-Tunnel {
    $key = $values['EC2_SSH_PRIVATE_KEY_PATH']
    $target = $values['EC2_SSH_USER'] + '@' + $values['EC2_SSH_HOST']
    
    Write-Host "[$(Get-Date)] Starting SSH tunnel to $target"
    
    ssh -N -i "$key" -o BatchMode=yes -o ExitOnForwardFailure=yes \
       -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
       -L 127.0.0.1:18881:127.0.0.1:18880 "$target"
}

# Start tunnel
Start-Tunnel