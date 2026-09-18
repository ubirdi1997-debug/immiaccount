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

# Bridge configuration
$baseUrl = 'http://127.0.0.1:18881'
$apiKey = '32cd1fdbd5166abc085c5687471c3a3d543b5e960dbfcb25b3233b5660e37288'
$headers = @{
    'Content-Type' = 'application/json'
    'Authorization' = "Bearer $apiKey"
}

function Test-Bridge {
    try {
        $body = '{"model":"mistral.devstral-2-123b","messages":[{"role":"user","content":"test"}],"max_tokens":5}'
        $response = Invoke-RestMethod -Uri "$baseUrl/v1/chat/completions" -Method Post -Headers $headers -Body $body -TimeoutSec 10
        return $true
    } catch {
        return $false
    }
}

function Start-Tunnel {
    try {
        $key = $values['EC2_SSH_PRIVATE_KEY_PATH']
        $target = $values['EC2_SSH_USER'] + '@' + $values['EC2_SSH_HOST']
        
        $process = Start-Process -FilePath ssh.exe -ArgumentList @(
            '-N',
            '-i', $key,
            '-o', 'BatchMode=yes',
            '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ServerAliveInterval=30',
            '-o', 'ServerAliveCountMax=3',
            '-L', '127.0.0.1:18881:127.0.0.1:18880',
            $target
        ) -NoNewWindow -PassThru
        
        # Wait for bridge to become available
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 3
            if (Test-Bridge) {
                Write-Host "[$(Get-Date)] ✅ Bridge is ready"
                return $process
            }
        }
        
        throw "Bridge did not become ready after 45 seconds"
    } catch {
        Write-Host "[$(Get-Date)] ❌ Tunnel start failed: $_"
        return $null
    }
}

# Main monitoring loop
Write-Host "[$(Get-Date)] 🚀 Starting uSafe Server Bridge monitor"

$tunnelProcess = $null

while ($true) {
    if (-not (Test-Bridge)) {
        Write-Host "[$(Get-Date)] 🔴 Bridge unavailable, attempting to restart..."
        
        # Kill existing tunnel if running
        if ($tunnelProcess) {
            try {
                $tunnelProcess | Stop-Process -Force
            } catch {}
        }
        
        # Start new tunnel
        $tunnelProcess = Start-Tunnel
        
        if (-not $tunnelProcess) {
            Start-Sleep -Seconds 15
            continue
        }
    }
    
    Start-Sleep -Seconds 30
}