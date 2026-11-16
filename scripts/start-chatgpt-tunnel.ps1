param([switch]$BridgeOnly,[switch]$TunnelOnly)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$envFile=Join-Path $repo '.env.local'
if(!(Test-Path -LiteralPath $envFile)){throw 'Copy .env.example to .env.local first.'}
foreach($line in Get-Content -LiteralPath $envFile){
 $entry=$line.Trim()
 if(!$entry -or $entry.StartsWith('#')){continue}
 $pair=$entry -split '=',2
 if($pair.Count -ne 2 -or $pair[0].Trim() -notmatch '^[A-Z][A-Z0-9_]*$'){throw 'Invalid .env.local entry'}
 $v=$pair[1].Trim()
 if($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))){$v=$v.Substring(1,$v.Length-2)}
 [Environment]::SetEnvironmentVariable($pair[0].Trim(),$v,'Process')
}
if(!$env:MACBRIDGE_MCP_TOKEN_FILE){
 $env:MACBRIDGE_MCP_TOKEN_FILE=Join-Path $env:LOCALAPPDATA 'DevBridgeMCP\mcp-token.txt'
}
$tokenFile=$env:MACBRIDGE_MCP_TOKEN_FILE
if(!$TunnelOnly){
 Start-Process powershell.exe -WorkingDirectory $repo -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'start-local.ps1'))
 if($BridgeOnly){return}
}
$tunnelId=if($env:CONTROL_PLANE_TUNNEL_ID){$env:CONTROL_PLANE_TUNNEL_ID}else{$env:TUNNEL_ID}
if(!$env:TUNNEL_ROOT -or !$tunnelId -or !$env:CONTROL_PLANE_API_KEY){
 throw 'First create a tunnel at https://platform.openai.com/settings/organization/tunnels and a restricted runtime key at https://platform.openai.com/settings/organization/api-keys. Then set TUNNEL_ROOT, CONTROL_PLANE_TUNNEL_ID and CONTROL_PLANE_API_KEY in .env.local.'
}
if($tunnelId -notmatch '^tunnel_[a-z0-9_]+$'){throw 'Invalid tunnel ID. Copy the exact tunnel_id from OpenAI Platform.'}
$tunnelExe=$null
foreach($name in @('tunnel-client.exe','tunnel-client-runtime.exe')){
 $candidate=Join-Path $env:TUNNEL_ROOT $name
 if(Test-Path -LiteralPath $candidate -PathType Leaf){$tunnelExe=$candidate;break}
}
if(!$tunnelExe){throw 'Tunnel client missing. Download the official Windows release from https://platform.openai.com/settings/organization/tunnels or https://github.com/openai/tunnel-client/releases/latest.'}
# Wait briefly for start-local.ps1 to generate a token when both are started together.
$clock=[Diagnostics.Stopwatch]::StartNew()
while(!(Test-Path -LiteralPath $tokenFile) -and $clock.Elapsed.TotalSeconds -lt 20){Start-Sleep -Milliseconds 250}
if(!(Test-Path -LiteralPath $tokenFile)){throw 'MCP token unavailable. Start scripts/start-local.ps1 and check for errors.'}
$token=[IO.File]::ReadAllText($tokenFile).Trim()
if($token.Length -lt 32){throw 'Invalid local MCP bearer token'}
$env:MACBRIDGE_MCP_AUTH="Bearer $token"
$port=if($env:SQL_BRIDGE_PORT){$env:SQL_BRIDGE_PORT}else{'8788'}
$mcpUrl="url=http://127.0.0.1:$port/mcp,channel=main"
Write-Output 'Starting OpenAI Secure MCP Tunnel (secrets not printed).'
# These compatibility flags must be supported by your installed tunnel-client.
# If not, use its current help quickstart / init / doctor / run profile workflow.
& $tunnelExe run --control-plane.tunnel-id $tunnelId --mcp.server-url $mcpUrl --harpoon.allow-plaintext-http --mcp.extra-headers 'Authorization: env:MACBRIDGE_MCP_AUTH' --mcp.discovery-extra-headers 'Authorization: env:MACBRIDGE_MCP_AUTH'
if($LASTEXITCODE -ne 0){throw "Tunnel client exited with code $LASTEXITCODE. Verify the installed version's supported flags with tunnel-client help quickstart."}
