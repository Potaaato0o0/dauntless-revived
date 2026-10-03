$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$ports=@{}
Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -ge 8750 -and $_.LocalPort -le 8800} | ForEach-Object {$ports[[int]$_.OwningProcess]=$_.LocalPort}
$roles=@{}
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
 if($_.LocalPort -eq 61001){$roles[[int]$_.OwningProcess]='deploy'}
 if($_.LocalPort -eq 61005){$roles[[int]$_.OwningProcess]='allowlist'}
 if($_.LocalPort -eq 61111){$roles[[int]$_.OwningProcess]='monitor'}
}
$processes=@(Get-Process -Name node,Dauntless-Win64-Shipping -ErrorAction SilentlyContinue | ForEach-Object {
 if($_.ProcessName -eq 'Dauntless-Win64-Shipping' -or $roles.ContainsKey($_.Id)){
  [pscustomobject]@{pid=$_.Id;role=$(if($roles.ContainsKey($_.Id)){$roles[$_.Id]}else{'hunt'});port=$ports[$_.Id];cpuSeconds=$_.CPU;workingSetMB=$_.WorkingSet64/1MB;privateMB=$_.PrivateMemorySize64/1MB;startedAt=$_.StartTime.ToUniversalTime().ToString('o')}
 }
})
$network=Get-NetAdapterStatistics -ErrorAction SilentlyContinue
[pscustomobject]@{at=(Get-Date).ToUniversalTime().ToString('o');processes=$processes;receivedBytes=($network|Measure-Object ReceivedBytes -Sum).Sum;sentBytes=($network|Measure-Object SentBytes -Sum).Sum}|ConvertTo-Json -Depth 4 -Compress
