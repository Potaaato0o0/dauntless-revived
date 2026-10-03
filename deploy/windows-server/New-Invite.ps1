<#
.SYNOPSIS
    Creates an invite code on this Dauntless Revived server and prints the invite string for a friend.

.DESCRIPTION
    Uses the owner (admin) key from <root>\data\keys\owner.key (never printed) to call the metagame's
    CreateInvite on this machine (admin routes are never reachable through the gateway), then prints
    one line the friend pastes into the launcher (or clicks, once the launcher is installed).

    Public mode (v2):
        dauntless-revived://join?v=2&mode=public&host=203.0.113.7&port=443&fp=<64 hex>&code=ABCD-EFGH-JKLM&name=...
    The fp is the SHA-256 of the gateway's certificate; the launcher accepts that certificate and no
    other, so nobody in between can read or change the traffic. Before printing, the script connects to
    the gateway exactly as a launcher would (TLS, pinned to that fingerprint) and checks that it answers.

    Private mode (v1, Tailscale):
        dauntless-revived://join?v=1&host=100.x.y.z&port=61000&code=ABCD-EFGH-JKLM&name=...&share=...
    A friend can only reach the server after you share this machine with their Tailscale account:
    Tailscale admin console > Machines > this machine > "..." > Share. If you put the share link in
    -ShareUrl (or once with -SaveShareUrl), it goes into the invite and the launcher opens it for them.

    The invite code is single-use by default (-Uses to change it). It lets someone create an account;
    it is not a password, but send it only to the friend it is for. -List shows the existing codes;
    -Revoke <code> deletes one.

.EXAMPLE
    C:\DauntlessRevived\bin\New-Invite.ps1 -For Alex
.EXAMPLE
    C:\DauntlessRevived\bin\New-Invite.ps1 -Uses 3 -For "Saturday group"
#>
[CmdletBinding(SupportsShouldProcess = $true, DefaultParameterSetName = 'Create')]
param(
    [string]$Root,
    [Parameter(ParameterSetName = 'Create')][ValidateRange(1, 100)][int]$Uses = 1,
    [Parameter(ParameterSetName = 'Create')][string]$For,
    [Parameter(ParameterSetName = 'Create')][string]$ShareUrl,
    [Parameter(ParameterSetName = 'Create')][switch]$SaveShareUrl,
    [Parameter(ParameterSetName = 'Create')][string]$AdvertiseHost,
    [Parameter(ParameterSetName = 'Create')][switch]$SkipGatewayCheck,
    [Parameter(ParameterSetName = 'List')][switch]$List,
    [Parameter(ParameterSetName = 'Revoke')][string]$Revoke
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\DauntlessServer.Common.ps1"

try {
    $Root = Resolve-DRRoot $Root $PSScriptRoot
    $P = Get-DRPaths $Root
    $Cfg = Get-DRConfig $Root
    $mode = Get-DRMode $Cfg
    $bind = Get-DRConfigValue $Cfg 'BindAddress' '127.0.0.1'
    $port = Get-DRPort $Cfg 'metagame'
    $api = "http://${bind}:$port/undaunted/api"

    if (-not (Test-Path -LiteralPath $P.OwnerKey)) { Stop-DR "No owner key at $($P.OwnerKey)." }
    try { $key = ([IO.File]::ReadAllText($P.OwnerKey)).Trim() }
    catch { Stop-DR "Cannot read $($P.OwnerKey). Run this in an elevated PowerShell (Run as administrator)." }
    $h = @{ 'x-undaunted-user-api-key' = $key }

    $me = Invoke-DRHttp -Url "$api/GetUserInfo" -Headers $h -TimeoutSec 10
    if ($me.Status -eq 0) { Stop-DR "The metagame at ${bind}:$port does not answer ($($me.Error)). Is the stack running? (Stack.ps1 status)" }
    if ($me.Status -ne 200) { Stop-DR "The metagame refused the owner key (HTTP $($me.Status))." }
    if (-not $me.Json.IsAdmin) { Stop-DR "The account in owner.key ('$($me.Json.Username)') is not an admin." }

    if ($List) {
        $r = Invoke-DRHttp -Url "$api/InviteCodes" -Headers $h
        if ($r.Status -ne 200) { Stop-DR "Listing invite codes failed (HTTP $($r.Status))." }
        $codes = @($r.Json.InviteCodes)
        if (-not $codes.Count) { 'no invite codes' }
        foreach ($c in $codes) {
            $left = if ($c.infiniteUses) { 'unlimited' } else { "$($c.usesRemaining) use(s) left" }
            '{0,-20} {1}' -f $c.inviteCode, $left
        }
        exit 0
    }

    if ($Revoke) {
        if (-not (Test-DRInviteCode $Revoke)) { Stop-DR 'That is not an invite code.' }
        if ($PSCmdlet.ShouldProcess($Revoke, 'Delete invite code')) {
            $r = Invoke-DRHttp -Method DELETE -Url ("$api/InviteCode/" + [Uri]::EscapeDataString($Revoke)) -Headers $h
            if ($r.Status -ne 200) { Stop-DR "Deleting the code failed (HTTP $($r.Status))." }
            Write-DROk "invite code $Revoke deleted (accounts already made with it stay)"
        }
        exit 0
    }

    $name = Get-DRConfigValue $Cfg 'ServerName' 'Dauntless Revived'
    if ($For -and $For -match '[\x00-\x1f]') { Stop-DR '-For must be plain text.' }

    if ($mode -eq 'Public') {
        if ($ShareUrl -or $SaveShareUrl) { Stop-DR 'Tailscale share links belong to private mode.' }
        $inviteHost = if ($AdvertiseHost) { $AdvertiseHost.ToLowerInvariant() } else { [string](Get-DRConfigValue $Cfg 'PublicHost' '') }
        $invitePort = Get-DRPort $Cfg 'gateway'
        $fp = [string](Get-DRConfigValue $Cfg 'CertFingerprint' '')
        if (-not (Test-DRHost $inviteHost)) { Stop-DR "server.json has no usable PublicHost ('$inviteHost'). Run the installer again with -PublicHost." }
        if (-not (Test-DRFingerprint $fp)) { Stop-DR 'server.json has no certificate fingerprint. Run the installer again.' }
        if ((Test-Path -LiteralPath $P.GatewayCert) -and (Get-DRCertFingerprint $P.GatewayCert) -ne $fp) {
            Stop-DR "The certificate in $($P.GatewayCert) does not have the fingerprint in server.json. Run the installer again before inviting anyone."
        }
        # The same path a friend's launcher takes: TLS to the gateway, certificate pinned to fp.
        if (-not $SkipGatewayCheck) {
            $gw = Invoke-DRHttp -Url ('https://127.0.0.1:{0}/undaunted/api/RegistrationStatus' -f $invitePort) -Fingerprint $fp -TimeoutSec 10
            if ($gw.Status -ne 200) { Stop-DR "The gateway does not answer over TLS with the invite's certificate ($(if ($gw.Status) { "HTTP $($gw.Status)" } else { $gw.Error })). Check Stack.ps1 status." }
            Write-DROk "gateway answers on port $invitePort with certificate $($fp.Substring(0, 16))... (registration: $($gw.Json.RegistrationMode))"
        }
    } else {
        # Where friends connect: the advertised host (the Tailscale IPv4 address by default, or the
        # MagicDNS name if you set AdvertiseHost in server.json or pass -AdvertiseHost).
        $inviteHost = if ($AdvertiseHost) { $AdvertiseHost } else { Get-DRConfigValue $Cfg 'AdvertiseHost' $bind }
        $invitePort = $port
        $fp = $null
        if (-not $ShareUrl) { $ShareUrl = Get-DRConfigValue $Cfg 'TailscaleShareUrl' '' }
        if ($ShareUrl -and -not (Test-DRShareUrl $ShareUrl)) { Stop-DR 'The share link must start with https://login.tailscale.com/' }
        if ($inviteHost -match '^127\.' -and -not (Get-DRConfigValue $Cfg 'Sandbox' $false)) {
            Write-DRWarn "The server listens on $inviteHost, which only this machine can reach."
        }
    }

    if (-not $PSCmdlet.ShouldProcess("$Uses-use invite code", 'Create')) { exit 0 }

    $code = $null
    $body = @{ uses = $Uses }
    if ($For) { $body.name = $For }
    $r = Invoke-DRHttp -Method POST -Url "$api/CreateInvite" -Headers $h -Body $body
    if ($r.Status -eq 200 -and $r.Json -and (Test-DRInviteCode ([string]$r.Json.code))) {
        $code = [string]$r.Json.code
    } elseif ($r.Status -eq 404) {
        # Older metagame without CreateInvite: make the code here and register it.
        $code = New-DRInviteCode
        $r2 = Invoke-DRHttp -Method POST -Url "$api/RegisterInviteCode" -Headers $h -Body @{ NewInviteCode = $code; Uses = $Uses; InfiniteUses = $false }
        if ($r2.Status -ne 200) { Stop-DR "RegisterInviteCode failed (HTTP $($r2.Status))." }
    } else {
        Stop-DR "CreateInvite failed (HTTP $($r.Status) $(Get-DRErrorCode $r) $($r.Error))."
    }

    # Check that the code really exists before handing it out.
    $l = Invoke-DRHttp -Url "$api/InviteCodes" -Headers $h
    if ($l.Status -eq 200 -and -not (@($l.Json.InviteCodes) | Where-Object { $_.inviteCode -ceq $code })) {
        Stop-DR 'The new code is not in the server''s list. Nothing was handed out.'
    }

    if ($mode -eq 'Public') {
        $invite = New-DRInviteString -Mode Public -ServerHost $inviteHost -Port $invitePort -Fingerprint $fp -Code $code -Name $name
    } else {
        if ($SaveShareUrl -and $ShareUrl) {
            Set-DRConfigValue $Cfg 'TailscaleShareUrl' $ShareUrl
            Save-DRConfig $Root $Cfg
            Write-DROk 'share link saved in server.json; later invites include it automatically'
        }
        $invite = New-DRInviteString -Mode Private -ServerHost $inviteHost -Port $invitePort -Code $code -Name $name -ShareUrl $ShareUrl
    }
    # Round trip through the strict parser: never hand out a string the launcher would refuse.
    $parsed = ConvertFrom-DRInviteString $invite
    if ($parsed.Code -cne $code -or $parsed.Host -ne $inviteHost.ToLowerInvariant() -or $parsed.Port -ne $invitePort) { Stop-DR 'The invite string did not survive its own parser.' }

    Write-Host ''
    Write-Host "Invite for $(if ($For) { $For } else { 'a friend' }) ($Uses use$(if ($Uses -ne 1) { 's' })):" -ForegroundColor Cyan
    Write-Host ''
    Write-Output $invite
    Write-Host ''
    Write-Host "  Server : $name"
    Write-Host "  Address: ${inviteHost}:$invitePort$(if ($mode -eq 'Public') { ' (public, TLS)' } else { ' (Tailscale)' })"
    if ($fp) { Write-Host "  Cert   : $fp" }
    Write-Host "  Code   : $code"
    Write-Host ''
    if ($mode -eq 'Public') {
        Write-Host '  The friend pastes the whole line into the launcher. They need nothing else: no Tailscale, no'
        Write-Host '  port forwarding. Send it privately (it lets one person create an account).'
        Write-Host ''
        Write-Host "  Launcher: $($DRRepo.Url)/releases/latest  (DauntlessRevivedLauncher-Setup.exe)"
        Write-Host '  Windows may warn that the app is unrecognised: More info > Run anyway. If it only offers'
        Write-Host '  "Don''t run": check the file''s SHA-256 (Get-FileHash) against SHA256SUMS.txt from the same'
        Write-Host '  release, then right-click the file > Properties > Unblock, or run Unblock-File on it.'
        Write-Host '  Keep the launcher open while playing. A friend who already has an account chooses'
        Write-Host '  "I already have an account key" and pastes their account.key instead of registering.'
    } elseif ($ShareUrl) {
        Write-Host '  The invite includes your Tailscale share link. The friend accepts it with their own Tailscale account.'
    } else {
        Write-Host '  Before it works, share this machine with the friend in Tailscale:' -ForegroundColor Yellow
        Write-Host '    admin console (https://login.tailscale.com/admin/machines) > this machine > ... > Share'
        Write-Host '    Share only this machine. Do not invite friends into your tailnet.'
        Write-Host '  Tip: put the share link into the invite with -ShareUrl <link> -SaveShareUrl.'
    }
} catch {
    if ("$_" -notmatch '^DRFAIL:') { Write-Host "   FAIL  $_" -ForegroundColor Red }
    exit 1
}
