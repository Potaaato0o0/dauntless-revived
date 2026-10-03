<#
.SYNOPSIS
    Server side of Deploy-Remote.ps1's resumable, chunked upload of a large file (the 10.5 GB game zip).

.DESCRIPTION
    Deploy-Remote.ps1 (on the admin's PC) splits the file into parts, sends each part with scp and calls
    this script over SSH to check it. Everything lives in one folder (-Dir):

      upload.json            what is being uploaded: name, size, SHA-256, part size and every part's SHA-256
      upload.json.incoming   a new upload.json, sent at the start of every run
      partNNNNN, partNNNNN.ok  a part, and the SHA-256 it was verified with
      <name>.assembling, assemble.json   the file being put together, and how far that got
      <name>, <name>.ok      the finished file, and the SHA-256 it was verified with

    Actions (each prints one line "DRJSON:{...}" for the caller):
      Begin     accept upload.json.incoming; if it describes a different upload than before, drop the old
                parts. Reports what is already verified, so an interrupted upload resumes.
      Verify    hash part -Index against upload.json; keep it (writes .ok) or delete it.
      Assemble  append the verified parts in order, hashing each again on the way (a part that changed
                since it was verified is deleted and reported as bad); resumable. Finally checks the whole
                file's SHA-256 and renames it into place.
      Clean     delete the parts and the assembly files (not a finished file).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Begin', 'Verify', 'Assemble', 'Clean')][string]$Action,
    [Parameter(Mandatory = $true)][string]$Dir,
    [int]$Index = -1
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Out-Result($Object) { Write-Output ('DRJSON:' + ($Object | ConvertTo-Json -Compress -Depth 4)) }

function Get-Hex([byte[]]$Bytes) { return (-join ($Bytes | ForEach-Object { $_.ToString('x2') })) }

function Get-FileSha256([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

function Read-Manifest([string]$Path) {
    $m = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
    if ("$($m.name)" -notmatch '^[A-Za-z0-9._-]{1,100}$' -or "$($m.name)" -match '^\.') { throw 'manifest: bad name' }
    if ([int64]$m.size -le 0) { throw 'manifest: bad size' }
    if ("$($m.sha256)" -cnotmatch '^[0-9a-f]{64}$') { throw 'manifest: bad sha256' }
    if ([int64]$m.chunkSize -lt 1MB -or [int64]$m.chunkSize -gt 2GB) { throw 'manifest: bad chunkSize' }
    $n = [int][math]::Ceiling([double]$m.size / [double]$m.chunkSize)
    $chunks = @($m.chunks)
    if ($chunks.Count -ne $n) { throw "manifest: $($chunks.Count) part hashes for $n parts" }
    foreach ($c in $chunks) { if ("$c" -cnotmatch '^[0-9a-f]{64}$') { throw 'manifest: bad part hash' } }
    return [pscustomobject]@{ Name = [string]$m.name; Size = [int64]$m.size; Sha256 = [string]$m.sha256; ChunkSize = [int64]$m.chunkSize; Chunks = [string[]]$chunks; Count = $n }
}

function Get-Key($M) { return ('{0}|{1}|{2}|{3}|{4}' -f $M.Name, $M.Size, $M.Sha256, $M.ChunkSize, ($M.Chunks -join ',')) }
function Get-PartPath([int]$I) { return (Join-Path $Dir ('part{0:D5}' -f $I)) }
function Get-PartSize($M, [int]$I) { return [int64][math]::Min($M.ChunkSize, $M.Size - [int64]$I * $M.ChunkSize) }

function Test-Complete($M) {
    $final = Join-Path $Dir $M.Name
    $ok = "$final.ok"
    return ((Test-Path -LiteralPath $final) -and (Test-Path -LiteralPath $ok) -and (Get-Item -LiteralPath $final).Length -eq $M.Size -and ([IO.File]::ReadAllText($ok).Trim() -ceq $M.Sha256))
}

function Get-Progress {
    $f = Join-Path $Dir 'assemble.json'
    if (Test-Path -LiteralPath $f) { try { $p = [IO.File]::ReadAllText($f) | ConvertFrom-Json; return [pscustomobject]@{ Next = [int]$p.next; Bytes = [int64]$p.bytes } } catch {} }
    return [pscustomobject]@{ Next = 0; Bytes = 0 }
}

function Save-Progress([int]$Next, [int64]$Bytes) {
    $f = Join-Path $Dir 'assemble.json'
    [IO.File]::WriteAllText("$f.tmp", (@{ next = $Next; bytes = $Bytes } | ConvertTo-Json -Compress))
    Move-Item -LiteralPath "$f.tmp" -Destination $f -Force
}

function Remove-Parts {
    Get-ChildItem -LiteralPath $Dir -File | Where-Object { $_.Name -match '^part\d{5}(\.ok)?$' -or $_.Name -eq 'assemble.json' -or $_.Name -like '*.assembling' } | Remove-Item -Force
}

try {
    if (-not (Test-Path -LiteralPath $Dir)) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
    $Dir = (Resolve-Path -LiteralPath $Dir).Path
    $manifestFile = Join-Path $Dir 'upload.json'

    if ($Action -eq 'Clean') { Remove-Parts; Out-Result @{ ok = $true }; exit 0 }

    if ($Action -eq 'Begin') {
        $incoming = "$manifestFile.incoming"
        if (-not (Test-Path -LiteralPath $incoming)) { throw 'upload.json.incoming is missing' }
        $new = Read-Manifest $incoming
        $reset = $true
        if (Test-Path -LiteralPath $manifestFile) {
            try { $old = Read-Manifest $manifestFile; $reset = ((Get-Key $old) -cne (Get-Key $new)) } catch { $reset = $true }
        }
        if ($reset) { Remove-Parts }
        Move-Item -LiteralPath $incoming -Destination $manifestFile -Force
        $m = Read-Manifest $manifestFile
        # A finished file of the same name from an earlier, different upload is stale: remove it.
        $final = Join-Path $Dir $m.Name
        if ($reset -and (Test-Path -LiteralPath $final) -and -not (Test-Complete $m)) { Remove-Item -LiteralPath $final, "$final.ok" -Force -ErrorAction SilentlyContinue }
        if (Test-Complete $m) { Out-Result @{ complete = $true; path = (Join-Path $Dir $m.Name); reset = $reset }; exit 0 }
        $progress = Get-Progress
        $verified = @()
        for ($i = $progress.Next; $i -lt $m.Count; $i++) {
            $p = Get-PartPath $i
            if ((Test-Path -LiteralPath $p) -and (Test-Path -LiteralPath "$p.ok") -and (Get-Item -LiteralPath $p).Length -eq (Get-PartSize $m $i) -and ([IO.File]::ReadAllText("$p.ok").Trim() -ceq $m.Chunks[$i])) {
                $verified += $i
            }
        }
        Out-Result @{ complete = $false; reset = $reset; assembled = $progress.Next; verified = $verified; count = $m.Count }
        exit 0
    }

    $m = Read-Manifest $manifestFile

    if ($Action -eq 'Verify') {
        if ($Index -lt 0 -or $Index -ge $m.Count) { throw "part index $Index is out of range" }
        $p = Get-PartPath $Index
        $ok = $false; $why = ''
        if (-not (Test-Path -LiteralPath $p)) { $why = 'missing' }
        elseif ((Get-Item -LiteralPath $p).Length -ne (Get-PartSize $m $Index)) { $why = 'size' }
        elseif ((Get-FileSha256 $p) -cne $m.Chunks[$Index]) { $why = 'hash' }
        else { $ok = $true }
        if ($ok) { [IO.File]::WriteAllText("$p.ok", $m.Chunks[$Index]) }
        else { Remove-Item -LiteralPath $p, "$p.ok" -Force -ErrorAction SilentlyContinue }
        Out-Result @{ index = $Index; ok = $ok; reason = $why }
        exit 0
    }

    # Assemble
    if (Test-Complete $m) { Out-Result @{ complete = $true; path = (Join-Path $Dir $m.Name) }; exit 0 }
    $progress = Get-Progress
    $missing = @()
    for ($i = $progress.Next; $i -lt $m.Count; $i++) {
        $p = Get-PartPath $i
        if (-not (Test-Path -LiteralPath $p) -or -not (Test-Path -LiteralPath "$p.ok")) { $missing += $i }
    }
    if ($missing.Count) { Out-Result @{ complete = $false; missing = $missing; assembled = $progress.Next }; exit 0 }

    $target = Join-Path $Dir "$($m.Name).assembling"
    $out = New-Object IO.FileStream($target, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $out.SetLength($progress.Bytes)
        [void]$out.Seek(0, [IO.SeekOrigin]::End)
        $buf = New-Object byte[] (4MB)
        for ($i = $progress.Next; $i -lt $m.Count; $i++) {
            $p = Get-PartPath $i
            $before = $out.Position
            $sha = [Security.Cryptography.SHA256]::Create()
            $in = [IO.File]::OpenRead($p)
            try {
                while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
                    [void]$sha.TransformBlock($buf, 0, $n, $null, 0)
                    $out.Write($buf, 0, $n)
                }
                [void]$sha.TransformFinalBlock((New-Object byte[] 0), 0, 0)
            } finally { $in.Dispose() }
            $h = Get-Hex $sha.Hash
            $sha.Dispose()
            if ($h -cne $m.Chunks[$i] -or ($out.Position - $before) -ne (Get-PartSize $m $i)) {
                # Changed since it was verified: undo this part and ask for it again.
                $out.SetLength($before)
                $out.Flush()
                Save-Progress $i $before
                Remove-Item -LiteralPath $p, "$p.ok" -Force -ErrorAction SilentlyContinue
                Out-Result @{ complete = $false; bad = @($i); assembled = $i }
                exit 0
            }
            $out.Flush($true)
            Save-Progress ($i + 1) $out.Position
            Remove-Item -LiteralPath $p, "$p.ok" -Force
        }
    } finally { $out.Dispose() }

    $whole = Get-FileSha256 $target
    if ($whole -cne $m.Sha256) {
        Remove-Item -LiteralPath $target, (Join-Path $Dir 'assemble.json') -Force -ErrorAction SilentlyContinue
        Out-Result @{ complete = $false; error = "the assembled file has SHA-256 $whole, not $($m.Sha256); starting over" }
        exit 0
    }
    $final = Join-Path $Dir $m.Name
    if (Test-Path -LiteralPath $final) { Remove-Item -LiteralPath $final, "$final.ok" -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $target -Destination $final
    [IO.File]::WriteAllText("$final.ok", $m.Sha256)
    Remove-Item -LiteralPath (Join-Path $Dir 'assemble.json') -Force -ErrorAction SilentlyContinue
    Out-Result @{ complete = $true; path = $final }
    exit 0
} catch {
    Out-Result @{ error = "$($_.Exception.Message)" }
    exit 1
}
