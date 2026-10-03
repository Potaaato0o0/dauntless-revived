<#
.SYNOPSIS
    Turns the in-game text chat on or off on an installed public server.
.DESCRIPTION
    Chat (roadmap 3.10) is a listener inside the metagame on 127.0.0.1:61099 (62099 in a sandbox). The
    gateway already forwards the game's chat connection (a WebSocket upgrade) there, so no firewall
    rule is needed and none is opened. This writes CHAT, CHAT_BIND_HOST and CHAT_PORT in
    metagame.env and "Chat" in server.json, restarts the stack (with the usual backups around the stop
    and start), and waits up to 30 s for the listener to reach the new state. If the restart or the
    check fails, the old settings are put back and the stack restarted again.

    A restart drops the parties and matchmaking queues, which live in memory: switch it when nobody is
    playing. Public mode only for now.
.EXAMPLE
    C:\DauntlessRevived\bin\Set-Chat.ps1 -On
.EXAMPLE
    C:\DauntlessRevived\bin\Set-Chat.ps1 -Off
#>
[CmdletBinding(DefaultParameterSetName = 'On')]
param(
    [string]$Root = 'C:\DauntlessRevived',
    [Parameter(ParameterSetName = 'On', Mandatory = $true)][switch]$On,
    [Parameter(ParameterSetName = 'Off', Mandatory = $true)][switch]$Off
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\DauntlessServer.Common.ps1"

# Runs Stack.ps1 in a child PowerShell and says whether it worked
function Invoke-Stack([string]$Stack, [string]$Action) {
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $Stack $Action -Root $Root | Out-Host
    return ($LASTEXITCODE -eq 0)
}

$exitCode = 0
try {
    $Root = Resolve-DRRoot $Root $PSScriptRoot
    $paths = Get-DRPaths $Root
    $config = Get-DRConfig $Root
    $want = if ($On) { 'On' } else { 'Off' }
    $sandbox = [bool](Get-DRConfigValue $config 'Sandbox' $false)
    # A sandbox install runs as the current user; a real one needs an administrator (the stack's tasks)
    if (-not $sandbox -and -not (Test-DRAdmin)) { Stop-DR 'Run this in an elevated PowerShell.' }
    if ((Get-DRMode $config) -ne 'Public') { Stop-DR 'Chat works in public mode only for now (private mode comes later, roadmap 3.10).' }
    if (-not (Test-Path -LiteralPath $paths.MetaEnv)) { Stop-DR "Missing $($paths.MetaEnv). Run the installer first." }
    $port = Get-DRChatPort $sandbox
    $envMap = Read-DREnv $paths.MetaEnv
    $previousEnv = [IO.File]::ReadAllText($paths.MetaEnv)
    $previousChat = Resolve-DRChat '' $config
    $chatKeys = { param($Map) ($Map['CHAT'], $Map['CHAT_BIND_HOST'], $Map['CHAT_PORT']) -join '|' }
    $before = & $chatKeys $envMap
    Set-DRChatEnv $envMap $want $sandbox
    # "Already" comes from the chat values and server.json, never from the file's text: the installer and
    # updates write metagame.env too, and a change anywhere else in it is not a chat change
    if ((& $chatKeys $envMap) -ceq $before -and $previousChat -eq $want) {
        Write-DROk "chat is already $($want.ToLowerInvariant())"
        if ($On -and (Get-DRChatState $paths $config) -notlike 'listening *') {
            Write-DRWarn 'The saved setting is on, but chat is not listening. When nobody is playing, restart the metagame with Stack.ps1 restart -Only metagame and check its chat: log lines.'
        }
        exit 0
    }
    Set-DRConfigValue $config 'Chat' $want
    [void](Write-DREnv $paths.MetaEnv $envMap $script:DRSecretEnvHeader)
    Save-DRConfig $Root $config
    $stack = Join-Path $paths.Bin 'Stack.ps1'
    try {
        if (-not (Invoke-Stack $stack 'stop')) { throw 'Stack stop failed' }
        if (-not (Invoke-Stack $stack 'start')) { throw 'Stack start failed' }
        $listening = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $listening = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' }).Count -gt 0
            if ($listening -eq $On.IsPresent) { break }
            Start-Sleep -Seconds 1
        }
        if ($listening -ne $On.IsPresent) { throw "the chat listener on 127.0.0.1:$port did not $(if ($On) { 'start' } else { 'stop' })" }
        Write-DROk "chat $(if ($On) { "on: the gateway forwards the game's chat connection to 127.0.0.1:$port" } else { 'off' })"
    } catch {
        $reason = $_.Exception.Message
        Write-DRText -Path $paths.MetaEnv -Text $previousEnv
        Set-DRConfigValue $config 'Chat' $previousChat
        Save-DRConfig $Root $config
        [void](Invoke-Stack $stack 'stop')
        [void](Invoke-Stack $stack 'start')
        Stop-DR "Chat setting rolled back: $reason. The metagame log in $($paths.Logs) says why."
    }
} catch {
    if ("$_" -notmatch '^DRFAIL:') { Write-Host "   FAIL  $_" -ForegroundColor Red }
    $exitCode = 1
}
exit $exitCode
