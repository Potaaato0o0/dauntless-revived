# Dauntless Revived - one-time setup for a friend's PC.
#
# Checks the game files, installs the two server DLLs, registers your account on the
# host's server and saves your personal key. Safe to run again: it never registers twice
# and only copies a DLL when it is missing or wrong.
#
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 -Server 100.x.y.z
#
# -Server    the host's Tailscale address (the host tells you), optionally with :port
# -Game      the folder that contains Archon\ (default C:\D144\Dauntless)
# -Zip       optional: the downloaded game zip, to check it before you extract it
# -Username  3-16 letters, digits or _   (asked for if missing)
# -Invite    the invite code from the host (asked for if missing)
param(
  [string]$Server,
  [string]$Game = "C:\D144\Dauntless",
  [string]$Zip,
  [string]$Username,
  [string]$Invite
)
$ErrorActionPreference = "Stop"

$Pinned = @{
  "zip"                          = "556B9A648A5E5E7E11B6F8DD3D80FF8E88FCEB0D3448297AAF47CE7BF756BC6D"
  "Dauntless-Win64-Shipping.exe" = "D3D41E614908D2BEFD518B27046D9822D6130EF12BA3504BABBDB786BEF9CFF4"
  "dxgi.dll"                     = "9A431D7B6FD20C43FA92BEBD91C3BC023EC7A3FCBC52871C41F4DF293D4B0D1F"
  "UndauntedInternalServer.dll"  = "520EC588A0554E374B2B0D084CD7F7F08D59A9CB80362679845719D64A0D0933"
}
$Dir = Join-Path $env:APPDATA "DauntlessRevived"
$KeyFile = Join-Path $Dir "account.key"
$SettingsFile = Join-Path $Dir "settings.json"

function Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   OK  $text" -ForegroundColor Green }
function Fail($text) { Write-Host "   !!  $text" -ForegroundColor Red; exit 1 }
function Hash($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }

if (-not $Server) { $Server = (Read-Host "Host address (from the host, e.g. 100.x.y.z)").Trim() }
if (-not $Server) { Fail "No host address given." }
$ServerHost = ($Server -split ":")[0]
$Backend = if ($Server -match ":\d+$") { $Server } else { "${Server}:61000" }

# 1. The game zip (optional) and the game executable.
if ($Zip) {
  Step "Checking the game zip (this reads 11 GB and takes a minute or two)"
  if (-not (Test-Path -LiteralPath $Zip)) { Fail "Zip not found: $Zip" }
  if ((Hash $Zip) -ne $Pinned["zip"]) { Fail "The zip does not match the verified 1.4.4 build. Download it again." }
  Ok "zip matches the verified 1.4.4 build. Extract it so that $Game\Archon exists, then run this again without -Zip."
  exit 0
}

Step "Checking the game in $Game"
$Win64 = Join-Path $Game "Archon\Binaries\Win64"
$Exe = Join-Path $Win64 "Dauntless-Win64-Shipping.exe"
if (-not (Test-Path -LiteralPath $Exe)) { Fail "Not found: $Exe  (use -Game to point at the folder that contains Archon\)" }
if ((Hash $Exe) -ne $Pinned["Dauntless-Win64-Shipping.exe"]) { Fail "Dauntless-Win64-Shipping.exe is not the 1.4.4 build this server needs." }
Ok "Dauntless-Win64-Shipping.exe is the verified 1.4.4 build"

# 2. The two DLLs: taken from this kit, checked before and after copying.
Step "Installing the two server DLLs"
foreach ($name in "dxgi.dll", "UndauntedInternalServer.dll") {
  $target = Join-Path $Win64 $name
  if ((Test-Path -LiteralPath $target) -and ((Hash $target) -eq $Pinned[$name])) { Ok "$name already installed"; continue }
  $source = @((Join-Path $PSScriptRoot "dll\$name"), (Join-Path $PSScriptRoot "..\UndauntedLauncher\assets\$name")) |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $source) { Fail "$name is missing from this kit (expected in $PSScriptRoot\dll\)." }
  if ((Hash $source) -ne $Pinned[$name]) { Fail "The kit's $name does not match the pinned hash. Do not use this kit." }
  Copy-Item -LiteralPath $source -Destination $target -Force
  Unblock-File -LiteralPath $target
  if ((Hash $target) -ne $Pinned[$name]) { Fail "$name changed while copying. Is antivirus interfering?" }
  Ok "$name installed and checked"
}

$missing = @("MSVCP140.dll", "VCRUNTIME140_1.dll") | Where-Object { -not (Test-Path (Join-Path $env:WINDIR "System32\$_")) }
if ($missing) {
  Write-Host "   !!  Missing $($missing -join ', '): install the Microsoft Visual C++ 2015-2022 Redistributable (x64)" -ForegroundColor Yellow
  Write-Host "       from https://aka.ms/vs/17/release/vc_redist.x64.exe  - the game's server DLL needs it." -ForegroundColor Yellow
} else { Ok "Visual C++ runtime present" }

# 3. Can we reach the host?
Step "Contacting the host at $Backend"
$port = [int]($Backend -split ":")[-1]
$tcp = New-Object System.Net.Sockets.TcpClient
try {
  $wait = $tcp.BeginConnect($ServerHost, $port, $null, $null)
  if (-not $wait.AsyncWaitHandle.WaitOne(4000) -or -not $tcp.Connected) { throw "timeout" }
  $tcp.EndConnect($wait)
} catch {
  Fail "No answer from $Backend. Is Tailscale on, have you accepted the host's share, and is the host's server running?"
} finally { $tcp.Close() }
Ok "the host's server answers"

# 4. Register once, and keep the key private.
New-Item -ItemType Directory -Force $Dir | Out-Null
if (Test-Path -LiteralPath $KeyFile) {
  Step "Account"
  Ok "you already have a key in $Dir (not registering again)"
} else {
  Step "Registering your account"
  if (-not $Username) { $Username = (Read-Host "Choose a username (3-16 letters, digits or _)").Trim() }
  if ($Username -notmatch '^[A-Za-z0-9_]{3,16}$') { Fail "Usernames are 3-16 characters: letters, digits or _." }
  if (-not $Invite) { $Invite = (Read-Host "Invite code from the host").Trim() }
  $body = @{ Username = $Username; InviteCode = $Invite } | ConvertTo-Json
  try {
    $r = Invoke-RestMethod -Method Post -Uri "http://$Backend/undaunted/api/Register" -ContentType "application/json" -Body $body -TimeoutSec 20
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    switch ($code) {
      401 { Fail "The invite code is wrong or used up. Ask the host for a new one." }
      409 { Fail "That username is taken. Pick another." }
      400 { Fail "The host's server refused the registration (registration closed, or the username is not allowed)." }
      default { Fail "Registration failed: $($_.Exception.Message)" }
    }
  }
  if (-not $r.UUK) { Fail "The server did not return a key." }
  Set-Content -LiteralPath $KeyFile -Value $r.UUK -NoNewline -Encoding ASCII
  Ok "registered; your personal key is saved in $KeyFile"
  Write-Host "      Keep a copy somewhere safe (a password manager). Nobody can recover it for you." -ForegroundColor Yellow
}

# 5. Check that the key works, without ever printing it.
$key = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
try {
  $me = Invoke-RestMethod -Uri "http://$Backend/undaunted/api/GetUserInfo" -Headers @{ "x-undaunted-user-api-key" = $key } -TimeoutSec 20
} catch { Fail "The server did not accept your key. Ask the host." }
Ok "logged in as '$($me.name)'"

@{ Server = $Server; Game = $Game } | ConvertTo-Json | Set-Content -LiteralPath $SettingsFile -Encoding ASCII
Step "Done"
Write-Host "   Start the game with 'Play Dauntless.cmd' (or: powershell -ExecutionPolicy Bypass -File .\play.ps1)."
