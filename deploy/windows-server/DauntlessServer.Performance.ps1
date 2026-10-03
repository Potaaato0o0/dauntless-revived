# Dauntless Revived - the performance sampler (roadmap 4.12). Dot-sourced after DauntlessServer.Common.ps1
# by Stack.ps1 (the stack supervisor takes a sample every minute) and by Write-PerformanceLog.ps1.
#
# Windows PowerShell 5.1. ASCII only (5.1 reads BOM-less scripts as ANSI).
#
# One sample is one CSV row for the machine ("host") plus one row per stack process and game server,
# appended to data\logs\performance\performance-<UTC date>.csv. Files older than 30 days are deleted.
#
# Counts only. Nothing here writes a player name, an account id, a key or a command line:
# - processes are found the kit's way (Get-DRComponentProcesses, Get-DRGameServers) and only their
#   numbers are kept; a game server's command line starts with the game-server key and lists the
#   expected players' account ids, so its UDP port comes from its UDP endpoint, never from there
# - player counts come from the metagame's ServerStatus (asked with the owner key, like
#   `Stack.ps1 status`) and the deploy server's /gameservers; the names and ids in those replies are
#   dropped in memory
#
# Every value is formatted with the invariant culture (a decimal point, whatever the Windows language).

$script:DRPerfColumns = @(
    'timestamp_utc',     # when the sample was taken
    'role',              # host, metagame, content, gateway, deploy, allowlist, ramsgate, dojo, hunt, tutorial, unknown
    'pid',
    'udp_port',          # game servers
    'started_utc',       # when the process started
    'players',           # game servers: players the metagame places there (heartbeats)
    'cpu_core_percent',  # processes: CPU since the previous sample, as a percentage of ONE core (can exceed 100)
    'working_set_mb',
    'private_mb',
    'host_cpu_percent',  # host: CPU of the whole machine since the previous sample (0-100)
    'logical_cpus',
    'ram_total_mb',
    'ram_free_mb',
    'disk_free_gb',      # the drive the server is installed on
    'net_in_kbit_s',     # network adapters (no loopback, VPN tunnels or virtual switches)
    'net_out_kbit_s',
    'game_servers',      # how many game servers run
    'players_online'     # the metagame's count (heartbeats in the last 90 s)
)
$script:DRPerfKeepDays = 30
$script:DRPerfFilePattern = '^performance-(\d{4}-\d\d-\d\d)\.csv$'
$script:DRInvariant = [Globalization.CultureInfo]::InvariantCulture

function Get-DRPerfHeader { return ($script:DRPerfColumns -join ',') }

function Get-DRPerfDir($Paths) { return (Join-Path $Paths.Logs 'performance') }

function Get-DRPerfFileName([datetime]$UtcNow) {
    return ('performance-{0}.csv' -f $UtcNow.ToString('yyyy-MM-dd', $script:DRInvariant))
}

function Format-DRPerfTime($Time) {
    if ($null -eq $Time) { return '' }
    return ([datetime]$Time).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $script:DRInvariant)
}

# One CSV field: numbers with a decimal point, nothing quoted unless it has to be (no value the sampler
# writes ever does).
function Format-DRPerfValue($Value) {
    if ($null -eq $Value) { return '' }
    if ($Value -is [double] -or $Value -is [single] -or $Value -is [decimal]) { $s = ([double]$Value).ToString('0.###', $script:DRInvariant) }
    elseif ($Value -is [datetime]) { $s = Format-DRPerfTime $Value }
    else { $s = [Convert]::ToString($Value, $script:DRInvariant) }
    if ($s -match '[",\r\n]') { $s = '"' + $s.Replace('"', '""') + '"' }
    return $s
}

function ConvertTo-DRPerfCsvLine($Row) {
    return (($script:DRPerfColumns | ForEach-Object { Format-DRPerfValue $Row[$_] }) -join ',')
}

function New-DRPerfRow([datetime]$UtcNow, [string]$Role) {
    $row = [ordered]@{}
    foreach ($c in $script:DRPerfColumns) { $row[$c] = $null }
    $row.timestamp_utc = Format-DRPerfTime $UtcNow
    $row.role = $Role
    return $row
}

# ---------------------------------------------------------------------------------------------
# The arithmetic, kept pure for the unit tests
# ---------------------------------------------------------------------------------------------
# CPU time used between two samples, as a percentage of one core. $null when there is no earlier
# sample, no time passed, or the counter went backwards (another process with the same pid).
function Get-DRCpuCorePercent([double]$CpuSecondsBefore, [double]$CpuSecondsNow, [double]$ElapsedSeconds) {
    if ($ElapsedSeconds -le 0 -or $CpuSecondsNow -lt $CpuSecondsBefore) { return $null }
    return [math]::Round(($CpuSecondsNow - $CpuSecondsBefore) / $ElapsedSeconds * 100, 1)
}

# The machine's CPU from two readings of the raw _Total processor counter: PercentProcessorTime counts
# idle time (100 ns units), Timestamp_Sys100NS wall time. Busy = 1 - idle / elapsed.
function Get-DRHostCpuPercent($Before, $Now) {
    if ($null -eq $Before -or $null -eq $Now) { return $null }
    $dt = [double]$Now.Time - [double]$Before.Time
    $di = [double]$Now.Idle - [double]$Before.Idle
    if ($dt -le 0 -or $di -lt 0) { return $null }
    return [math]::Round([math]::Min(100, [math]::Max(0, 100 * (1 - $di / $dt))), 1)
}

# Bytes counted between two readings, as kilobits per second.
function Get-DRKbitPerSecond([double]$BytesBefore, [double]$BytesNow, [double]$ElapsedSeconds) {
    if ($ElapsedSeconds -le 0 -or $BytesNow -lt $BytesBefore) { return $null }
    return [math]::Round(($BytesNow - $BytesBefore) * 8 / 1000 / $ElapsedSeconds, 1)
}

# A game server's role. The deploy server's kind wins when it is known; otherwise the port decides,
# the way Stack.ps1 status does: Ramsgate on UdpPortEnd, the Training Dojo one below, hunts on the
# rest (the range comes from server.json, so it follows the ports when they move, roadmap 4.13).
function Get-DRGameServerRole([int]$Port, [int]$UdpPortEnd, [string]$Kind) {
    switch ($Kind) {
        'city'     { return 'ramsgate' }
        'dojo'     { return 'dojo' }
        'tutorial' { return 'tutorial' }
        'hunt'     { return 'hunt' }
    }
    if ($Port -le 0) { return 'unknown' }   # no UDP port yet: still starting
    if ($Port -eq $UdpPortEnd) { return 'ramsgate' }
    if ($Port -eq ($UdpPortEnd - 1)) { return 'dojo' }
    return 'hunt'
}

# Per game-server port: its kind (from the deploy server's /gameservers) and its player count (the
# metagame's ServerStatus instances, matched by id). Only ports, kinds and numbers come out: the
# expected players' account ids and the players' names in the replies never leave this function.
function Get-DRGameServerCounts($DeployServers, $Instances) {
    $players = @{}
    foreach ($i in @($Instances)) {
        if ($null -eq $i) { continue }
        $n = 0
        if ($i.id -and [int]::TryParse([string]$i.players, [ref]$n) -and $n -ge 0) { $players[[string]$i.id] = $n }
    }
    $byPort = @{}
    foreach ($s in @($DeployServers)) {
        if ($null -eq $s) { continue }
        $port = 0
        if (-not [int]::TryParse([string]$s.port, [ref]$port) -or $port -le 0) { continue }
        $kind = if (@('city', 'hunt', 'dojo', 'tutorial') -contains [string]$s.kind) { [string]$s.kind } else { '' }
        $count = $null
        if ($s.id -and $players.ContainsKey([string]$s.id)) { $count = $players[[string]$s.id] }
        # A reused port: the newest server is the one running there (ISO times sort as text).
        if ($byPort.ContainsKey($port) -and [string]::CompareOrdinal([string]$byPort[$port].StartedAt, [string]$s.startedAt) -gt 0) { continue }
        $byPort[$port] = [pscustomobject]@{ Kind = $kind; Players = $count; StartedAt = [string]$s.startedAt }
    }
    return $byPort
}

# ---------------------------------------------------------------------------------------------
# Readings
# ---------------------------------------------------------------------------------------------
function New-DRPerfState {
    return @{ Cpu = @{}; HostCpu = $null; Net = $null; LastError = ''; LastPruneDay = '' }
}

function Read-DRHostCpuCounter {
    $c = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction Stop
    return [pscustomobject]@{ Idle = [double]$c.PercentProcessorTime; Time = [double]$c.Timestamp_Sys100NS }
}

# Bytes received and sent on the machine's network adapters so far. Loopback, VPN tunnels (Tailscale,
# WireGuard) and virtual switches are left out: their traffic also crosses a real adapter.
function Read-DRNetworkBytes {
    $in = 0.0; $out = 0.0
    foreach ($n in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($n.OperationalStatus -ne 'Up') { continue }
        if (@('Loopback', 'Tunnel') -contains [string]$n.NetworkInterfaceType) { continue }
        if ($n.Description -match 'Tailscale|WireGuard|Wintun|TAP-Windows|Hyper-V Virtual Ethernet|VirtualBox|VMware Virtual') { continue }
        $s = $n.GetIPStatistics()
        $in += [double]$s.BytesReceived; $out += [double]$s.BytesSent
    }
    return [pscustomobject]@{ In = $in; Out = $out; At = [datetime]::UtcNow }
}

# The counts from the metagame and the deploy server, or $null values when they do not answer. The
# owner key is read, sent in one header and dropped; the replies' names and ids are dropped too.
function Read-DRPerfCounts($Paths, $Config, [string[]]$Components) {
    $result = [pscustomobject]@{ PlayersOnline = $null; ByPort = @{} }
    $deployServers = @()
    if ($Components -contains 'deploy') {
        $r = Invoke-DRHttp -Url ('http://127.0.0.1:{0}/gameservers' -f (Get-DRPort $Config 'deploy')) -TimeoutSec 3
        if ($r.Status -eq 200 -and $r.Json -and $r.Json.PSObject.Properties['servers']) { $deployServers = @($r.Json.servers) }
        $r = $null
    }
    $instances = @()
    if ($Components -contains 'metagame') {
        $h = $null
        try { $k = Read-DRAccountKey $Paths.OwnerKey; if ($k) { $h = @{ 'x-undaunted-user-api-key' = $k } } } catch {}
        $k = $null
        $bind = Get-DRConfigValue $Config 'BindAddress' '127.0.0.1'
        $r = Invoke-DRHttp -Url ('http://{0}:{1}/undaunted/api/ServerStatus' -f $bind, (Get-DRPort $Config 'metagame')) -Headers $h -TimeoutSec 3
        $h = $null
        # The limited answer (no key, or a key the server refused) says 0 players: that is not a count.
        if ($r.Status -eq 200 -and $r.Json -and $r.Json.limited -ne $true) {
            $n = 0
            if ([int]::TryParse([string]$r.Json.playersOnline, [ref]$n)) { $result.PlayersOnline = $n }
            $instances = @($r.Json.instances)
        }
        $r = $null
    }
    $result.ByPort = Get-DRGameServerCounts $deployServers $instances
    $deployServers = $null; $instances = $null
    return $result
}

function Get-DRProcessCpuSeconds($Process) {
    return (([double]$Process.KernelModeTime + [double]$Process.UserModeTime) / 1e7)
}

# One row for a process (a Win32_Process object). The CPU table in $State is keyed by pid and start
# time, so a reused pid never borrows another process's numbers.
function New-DRPerfProcessRow($State, [datetime]$UtcNow, [string]$Role, $Process) {
    $row = New-DRPerfRow $UtcNow $Role
    $row.pid = [int]$Process.ProcessId
    $row.started_utc = Format-DRPerfTime $Process.CreationDate
    $row.working_set_mb = [math]::Round([double]$Process.WorkingSetSize / 1MB, 1)
    $row.private_mb = [math]::Round([double]$Process.PrivatePageCount / 1MB, 1)
    $key = '{0}@{1}' -f $Process.ProcessId, $row.started_utc
    $cpu = Get-DRProcessCpuSeconds $Process
    $prev = $State.Cpu[$key]
    if ($prev) { $row.cpu_core_percent = Get-DRCpuCorePercent $prev.Cpu $cpu ($UtcNow - $prev.At).TotalSeconds }
    $State.Seen[$key] = @{ Cpu = $cpu; At = $UtcNow }
    return $row
}

# Takes one sample and returns its rows (host first). Each reading fails on its own: a value that
# cannot be read stays empty and the rest of the row is still written.
function Invoke-DRPerfSample {
    param($State, $Paths, $Config)
    $now = [datetime]::UtcNow
    $State.Seen = @{}
    $components = @(Get-DRConfigValue $Config 'Components' @('metagame', 'content', 'deploy'))
    $gameDir = Get-DRConfigValue $Config 'GameDir' ''
    $udpEnd = [int](Get-DRConfigValue $Config 'UdpPortEnd' $script:DRUdpEnd)

    $hostRow = New-DRPerfRow $now 'host'
    $hostRow.logical_cpus = [Environment]::ProcessorCount
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $hostRow.ram_total_mb = [math]::Round([double]$os.TotalVisibleMemorySize / 1024)
        $hostRow.ram_free_mb = [math]::Round([double]$os.FreePhysicalMemory / 1024)
    } catch {}
    try {
        $c = Read-DRHostCpuCounter
        $hostRow.host_cpu_percent = Get-DRHostCpuPercent $State.HostCpu $c
        $State.HostCpu = $c
    } catch {}
    try {
        $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($Paths.Root))
        $hostRow.disk_free_gb = [math]::Round([double]$drive.AvailableFreeSpace / 1GB, 1)
    } catch {}
    try {
        $net = Read-DRNetworkBytes
        if ($State.Net) {
            $secs = ($net.At - $State.Net.At).TotalSeconds
            $hostRow.net_in_kbit_s = Get-DRKbitPerSecond $State.Net.In $net.In $secs
            $hostRow.net_out_kbit_s = Get-DRKbitPerSecond $State.Net.Out $net.Out $secs
        }
        $State.Net = $net
    } catch {}
    $counts = [pscustomobject]@{ PlayersOnline = $null; ByPort = @{} }
    try { $counts = Read-DRPerfCounts $Paths $Config $components } catch {}
    $hostRow.players_online = $counts.PlayersOnline

    $rows = New-Object System.Collections.Generic.List[object]
    $rows.Add($hostRow)
    foreach ($c in $script:DRComponentOrder) {
        if ($components -notcontains $c) { continue }
        foreach ($pr in @(Get-DRComponentProcesses $Paths $c)) { $rows.Add((New-DRPerfProcessRow $State $now $c $pr)) }
    }

    $games = @(Get-DRGameServers $gameDir)
    $hostRow.game_servers = $games.Count
    if ($games.Count) {
        $ids = @($games | ForEach-Object { [int]$_.ProcessId })
        $ports = @{}
        foreach ($e in @(Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $ids -contains [int]$_.OwningProcess -and $_.LocalPort -ge 8700 -and $_.LocalPort -le 8799 })) {
            $o = [int]$e.OwningProcess
            if (-not $ports.ContainsKey($o) -or [int]$e.LocalPort -lt $ports[$o]) { $ports[$o] = [int]$e.LocalPort }
        }
        foreach ($g in $games | Sort-Object { $ports[[int]$_.ProcessId] }) {
            $port = 0
            if ($ports.ContainsKey([int]$g.ProcessId)) { $port = $ports[[int]$g.ProcessId] }
            $info = $counts.ByPort[$port]
            $kind = if ($info) { $info.Kind } else { '' }
            $row = New-DRPerfProcessRow $State $now (Get-DRGameServerRole $port $udpEnd $kind) $g
            if ($port -gt 0) { $row.udp_port = $port }
            if ($info) { $row.players = $info.Players }
            $rows.Add($row)
        }
    }
    # Only the processes seen now are remembered: exited pids leave the CPU table.
    $State.Cpu = $State.Seen
    $State.Remove('Seen')
    return $rows.ToArray()
}

# ---------------------------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------------------------
# data\logs is writable by the service account. The sampler never follows a planted link: it refuses
# to write when the logs folder, the performance folder or the day's file is a junction or symbolic
# link, or when the file has a second name (a hard link), whoever runs it.
function Assert-DRPerfTarget([string]$Dir, [string]$File) {
    foreach ($d in @((Split-Path $Dir -Parent), $Dir)) {
        if (Test-DRReparsePoint $d) { throw "$d is a junction or symbolic link (tampering?); not writing the performance log" }
    }
    if (Test-Path -LiteralPath $File) {
        $it = Get-Item -LiteralPath $File -Force
        if ($it.PSIsContainer -or ($it.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "$File is not a plain file (tampering?); not writing the performance log" }
        if ([string]$it.LinkType -eq 'HardLink') { throw "$File has more than one name (a hard link; tampering?); not writing the performance log" }
    }
}

# Appends the rows to the day's file (UTC), with the header when the file is new. Returns the file.
# Throws when the file cannot be written (for example, open in Excel): the caller skips that sample.
function Write-DRPerfRows([string]$Dir, [datetime]$UtcNow, $Rows) {
    $file = Join-Path $Dir (Get-DRPerfFileName $UtcNow)
    Assert-DRPerfTarget $Dir $file
    if (-not (Test-Path -LiteralPath $Dir)) { New-Item -ItemType Directory -Path $Dir | Out-Null }
    $isNew = -not (Test-Path -LiteralPath $file)
    $sb = New-Object System.Text.StringBuilder
    if ($isNew) { [void]$sb.Append((Get-DRPerfHeader)).Append("`r`n") }
    foreach ($r in @($Rows)) { [void]$sb.Append((ConvertTo-DRPerfCsvLine $r)).Append("`r`n") }
    $bytes = [Text.Encoding]::ASCII.GetBytes($sb.ToString())
    $mode = if ($isNew) { [IO.FileMode]::CreateNew } else { [IO.FileMode]::Append }
    $fs = New-Object IO.FileStream($file, $mode, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try { $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Dispose() }
    return $file
}

# Deletes the day files older than -KeepDays (today counts as one). Only files named
# performance-yyyy-MM-dd.csv are touched, and a link is removed as a link, never followed.
function Remove-DROldPerfFiles([string]$Dir, [datetime]$UtcNow, [int]$KeepDays = $script:DRPerfKeepDays) {
    if (-not (Test-Path -LiteralPath $Dir) -or (Test-DRReparsePoint $Dir) -or (Test-DRReparsePoint (Split-Path $Dir -Parent))) { return 0 }
    $oldest = $UtcNow.Date.AddDays(1 - [math]::Max(1, $KeepDays))
    $removed = 0
    foreach ($f in @(Get-ChildItem -LiteralPath $Dir -File -Force -ErrorAction SilentlyContinue)) {
        $m = [regex]::Match($f.Name, $script:DRPerfFilePattern)
        if (-not $m.Success) { continue }
        $day = [datetime]::MinValue
        if (-not [datetime]::TryParseExact($m.Groups[1].Value, 'yyyy-MM-dd', $script:DRInvariant, [Globalization.DateTimeStyles]::None, [ref]$day)) { continue }
        if ($day -lt $oldest) { Remove-DRItemNoFollow $f.FullName; $removed++ }
    }
    return $removed
}

# A sample, written, with the old files pruned once a day. For the stack supervisor: returns a short
# message when the sample was skipped, '' when it was written.
function Invoke-DRPerfTick {
    param($State, $Paths, $Config, [int]$KeepDays = $script:DRPerfKeepDays)
    $dir = Get-DRPerfDir $Paths
    try {
        $rows = Invoke-DRPerfSample -State $State -Paths $Paths -Config $Config
        $now = [datetime]::UtcNow
        [void](Write-DRPerfRows $dir $now $rows)
        $day = $now.ToString('yyyy-MM-dd', $script:DRInvariant)
        if ($State.LastPruneDay -ne $day) { [void](Remove-DROldPerfFiles $dir $now $KeepDays); $State.LastPruneDay = $day }
        $State.LastError = ''
        return ''
    } catch {
        $msg = "$($_.Exception.Message)"
        if ($msg -eq $State.LastError) { return $null }   # already reported
        $State.LastError = $msg
        return $msg
    }
}
