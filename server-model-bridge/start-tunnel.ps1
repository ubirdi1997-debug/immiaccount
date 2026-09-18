$ErrorActionPreference='Stop'
$values=@{}
Get-Content (Join-Path $PSScriptRoot '../.env') | Where-Object {$_ -match '^[A-Za-z_][A-Za-z0-9_]*='} | ForEach-Object {$parts=$_ -split '=',2;$values[$parts[0]]=$parts[1].Trim('"')}
$dir=Join-Path $env:LOCALAPPDATA 'uSafeArch/gemma-vscode-bridge'
$config=Get-Content (Join-Path $dir 'server-config.json') -Raw | ConvertFrom-Json
$base='http://127.0.0.1:18881'
function Test-Bridge {try {$r=Invoke-RestMethod "$base/health" -Headers @{Authorization="Bearer $($config.token)"} -TimeoutSec 3;return $r.status -eq 'ready'}catch{return $false}}
if(!(Test-Bridge)) {
 $key=$values['EC2_SSH_PRIVATE_KEY_PATH'];$target=$values['EC2_SSH_USER']+'@'+$values['EC2_SSH_HOST']
 $process=Start-Process ssh.exe -WindowStyle Hidden -PassThru -ArgumentList @('-N','-i',('"'+$key+'"'),'-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-L','127.0.0.1:18881:127.0.0.1:18880',$target)
 for($i=0;$i -lt 15;$i++){Start-Sleep -Seconds 1;if(Test-Bridge){break};if($process.HasExited){throw 'SSH tunnel failed'}}
 if(!(Test-Bridge)){throw 'Bridge health check failed'}
}
@{base_url="$base/v1";api_key=$config.token} | ConvertTo-Json | Set-Content (Join-Path $dir 'server-client.json')
Write-Host 'Server bridge ready: http://127.0.0.1:18881/v1'
Write-Host 'VS Code API key is in %LOCALAPPDATA%\uSafeArch\gemma-vscode-bridge\server-client.json (do not share).'
