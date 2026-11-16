param([switch]$NoBuild)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$envFile=Join-Path $repo '.env.local'
if(!(Test-Path -LiteralPath $envFile)){throw 'Missing .env.local. Copy .env.example to .env.local and configure your project roots first.'}
foreach($raw in Get-Content -LiteralPath $envFile){
 $line=$raw.Trim()
 if(!$line -or $line.StartsWith('#')){continue}
 $pair=$line -split '=',2
 if($pair.Count -ne 2 -or $pair[0].Trim() -notmatch '^[A-Z][A-Z0-9_]*$'){throw 'Invalid .env.local line'}
 $name=$pair[0].Trim()
 $value=$pair[1].Trim()
 if($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))){$value=$value.Substring(1,$value.Length-2)}
 [Environment]::SetEnvironmentVariable($name,$value,'Process')
}
if($env:HOST -and $env:HOST -ne '127.0.0.1'){throw 'For local setup HOST must be 127.0.0.1. Use an authenticated secure tunnel for remote access.'}
$env:HOST='127.0.0.1'
if(!$env:BRIDGE_WRITE_ROOTS -or $env:BRIDGE_WRITE_ROOTS -match '^D:\\Projects$'){Write-Warning 'Configure BRIDGE_WRITE_ROOTS to existing trusted development folders before enabling write/command tools.'}
if(!$env:MACBRIDGE_MCP_TOKEN_FILE){
 $folder=Join-Path $env:LOCALAPPDATA 'DevBridgeMCP'
 $env:MACBRIDGE_MCP_TOKEN_FILE=Join-Path $folder 'mcp-token.txt'
}
$tokenFile=$env:MACBRIDGE_MCP_TOKEN_FILE
if(!(Test-Path -LiteralPath $tokenFile)){
 $parent=Split-Path -Parent $tokenFile
 if(!(Test-Path -LiteralPath $parent)){New-Item -ItemType Directory -Path $parent -Force | Out-Null}
 $bytes=New-Object byte[] 48
 [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
 $token=[Convert]::ToBase64String($bytes)
 [System.IO.File]::WriteAllText($tokenFile,$token,[Text.Encoding]::ASCII)
 # Limit token access to the current Windows user where supported.
 & icacls.exe $tokenFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
 if($LASTEXITCODE -ne 0){Write-Warning 'Verify token file permissions. Could not set Windows ACL.'}
 Write-Output "Created a new local authentication token at $tokenFile (value not printed)."
}
if(([IO.File]::ReadAllText($tokenFile)).Trim().Length -lt 32){throw 'MCP token must contain at least 32 characters.'}
Push-Location $repo
try {
 if(!$NoBuild){npm.cmd run build; if($LASTEXITCODE -ne 0){throw 'Build failed'}}
 Write-Output "Starting DevBridge MCP locally on http://127.0.0.1:$($env:SQL_BRIDGE_PORT)/mcp"
 npm.cmd run start:http
 if($LASTEXITCODE -ne 0){throw "Server exited with code $LASTEXITCODE"}
}finally{Pop-Location}
