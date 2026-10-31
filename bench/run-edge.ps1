# 画面を出さない Edge で testbook ファイルを開き、時間とメモリを測る（ふだんの Edge のプロファイルには触らない）。
#   powershell -ExecutionPolicy Bypass -File bench\run-edge.ps1 -File big.html
# ファイルは bench\make-big.ps1 -Measure で作ったもの。
param(
  [Parameter(Mandatory = $true)][string]$File,
  [int]$TimeoutSec = 300
)
$ErrorActionPreference = 'Stop'
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$path = (Resolve-Path $File).Path
$userDir = Join-Path $env:TEMP ("tb-edge-" + [guid]::NewGuid().ToString('N'))
$log = Join-Path $env:TEMP ("tb-edge-" + [guid]::NewGuid().ToString('N') + ".log")
$url = 'file:///' + ($path -replace '\\', '/')
$edgeArgs = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  "--user-data-dir=$userDir", '--enable-precise-memory-info', '--enable-logging=stderr', '--v=0', '--window-size=1400,900', $url)
$p = Start-Process -FilePath $edge -ArgumentList $edgeArgs -RedirectStandardError $log -PassThru -WindowStyle Hidden

# この試験で起動した Edge のプロセスだけを数える（使い捨てのプロファイルのフォルダ名で見分ける）
function Get-Ours { Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -like "*$userDir*" } }
$peak = 0; $metrics = $null; $start = Get-Date
while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
  Start-Sleep -Milliseconds 500
  $ours = @(Get-Ours)
  if ($ours.Count) {
    $mem = ($ours | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 } | Measure-Object -Sum).Sum
    if ($mem -gt $peak) { $peak = $mem }
  }
  if (Test-Path $log) {
    $line = Select-String -Path $log -Pattern 'TBMETRICS (\{.*?\})' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($line) { $metrics = $line.Matches[0].Groups[1].Value; break }
  }
}
$ours = @(Get-Ours)
$settled = ($ours | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 } | Measure-Object -Sum).Sum
$ours | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800
Remove-Item -Recurse -Force $userDir -ErrorAction SilentlyContinue
$result = [ordered]@{
  file = Split-Path $path -Leaf
  fileMB = [math]::Round((Get-Item $path).Length / 1MB, 1)
  seconds = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
  edgePeakMB = [math]::Round($peak / 1MB)
  edgeAfterMB = [math]::Round($settled / 1MB)
  page = if ($metrics) { $metrics | ConvertFrom-Json } else { 'no metrics (timeout or error) - see ' + $log }
}
if ($metrics) { Remove-Item $log -ErrorAction SilentlyContinue }
$result | ConvertTo-Json -Depth 3
