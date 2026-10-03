<#
.SYNOPSIS
    Records what the server uses (roadmap 4.12): CPU and memory of every game server and stack process,
    and the machine's CPU, RAM, disk and network, as CSV rows every minute.

.DESCRIPTION
    On an installed server the stack supervisor (the "Dauntless Revived stack" task) already takes a
    sample every minute, so this script is for a -Sandbox install, a stack started by hand, or one
    sample now (-Once).

    One sample is a "host" row plus one row per process: the metagame, content server, gateway, deploy
    server and allowlist helper that belong to this install, and every game server started from its game
    folder (role ramsgate, dojo, hunt or tutorial, with its UDP port, start time and player count).
    CPU is a percentage of ONE core since the previous sample, so the first sample of a run has no CPU
    figures; -Once takes a baseline and waits 2 seconds first. The rows go to
    data\logs\performance\performance-<UTC date>.csv, and files older than -KeepDays are deleted.

    Counts only: no player names, account ids, keys or command lines are written. Player counts come
    from the metagame, asked with the owner key the way "Stack.ps1 status" asks; without a readable
    owner key they stay empty.

    Game servers run as the service account. Run this as that account, or elevated: a PowerShell that
    is neither cannot see them. Whoever runs it, it refuses to write through a junction, symbolic link
    or hard link in data\logs (a folder the service account can write).

    Based on the first performance sampler by Vvoidddd (pull request #6).

.EXAMPLE
    C:\DauntlessRevived\bin\Write-PerformanceLog.ps1 -Once
.EXAMPLE
    .\Write-PerformanceLog.ps1 -Root C:\dr\sandbox-ws2019\root -IntervalSeconds 30
#>
param(
    [string]$Root,
    [ValidateRange(1, 3600)][int]$IntervalSeconds = 60,
    [switch]$Once,
    [ValidateRange(1, 3650)][int]$KeepDays = 30
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\DauntlessServer.Common.ps1"
. "$PSScriptRoot\DauntlessServer.Performance.ps1"

try {
    $Root = Resolve-DRRoot $Root $PSScriptRoot
    $P = Get-DRPaths $Root
    $Cfg = Get-DRConfig $Root
    $dir = Get-DRPerfDir $P
    $serviceUser = Get-DRConfigValue $Cfg 'ServiceUser' ''
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    if ($serviceUser -and $me -ine "$env:COMPUTERNAME\$serviceUser" -and -not (Test-DRAdmin)) {
        Write-DRWarn "not elevated and not '$serviceUser': the game servers (and their CPU) are invisible to this PowerShell"
    }
    $state = New-DRPerfState
    [void](Invoke-DRPerfSample -State $state -Paths $P -Config $Cfg)   # the CPU baseline
    $wait = if ($Once) { 2 } else { $IntervalSeconds }
    while ($true) {
        Start-Sleep -Seconds $wait
        try {
            $rows = @(Invoke-DRPerfSample -State $state -Paths $P -Config $Cfg)
            $now = [datetime]::UtcNow
            $file = Write-DRPerfRows $dir $now $rows
            $removed = Remove-DROldPerfFiles $dir $now $KeepDays
            $h = $rows[0]
            $line = '{0} host cpu {1}%  ram free {2} of {3} MB  game servers {4}  players {5}  -> {6} rows in {7}' -f $h.timestamp_utc,
                (Format-DRPerfValue $h.host_cpu_percent), $h.ram_free_mb, $h.ram_total_mb, $h.game_servers,
                $(if ($null -eq $h.players_online) { '?' } else { $h.players_online }), $rows.Count, $file
            Write-Host $line
            if ($removed) { Write-DRInfo "deleted $removed file(s) older than $KeepDays days" }
        } catch {
            if ($Once) { throw }
            Write-DRWarn "sample skipped: $($_.Exception.Message)"
        }
        if ($Once) { break }
    }
} catch {
    if ("$_" -notmatch '^DRFAIL:') { Write-Host "   FAIL  $_" -ForegroundColor Red }
    exit 1
}
