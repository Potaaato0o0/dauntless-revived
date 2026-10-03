# Runs only in an interactive operator session. Never put the owner key in a URL.
$ErrorActionPreference = 'Stop'
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        $client = New-Object Net.Sockets.TcpClient
        $pending = $client.ConnectAsync('127.0.0.1', 61110)
        if ($pending.Wait(1000) -and $client.Connected) { Start-Process 'http://127.0.0.1:61110'; return }
    } catch {} finally { if ($client) { $client.Dispose() } }
    Start-Sleep -Seconds 2
}
Write-Warning 'Owner dashboard did not start. Check the Dauntless Revived dashboard scheduled task.'
