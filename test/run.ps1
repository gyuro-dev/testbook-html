# testbook の試験を、画面を出さない Chrome / Edge で走らせる（Windows 用。macOS / Linux / WSL は test/run.sh）。
# Node などは要らない。ふだんのブラウザのプロファイルには触らない。
#   powershell -ExecutionPolicy Bypass -File test\run.ps1              全部走らせる
#   powershell -ExecutionPolicy Bypass -File test\run.ps1 -Filter マージ   名前に「マージ」を含む試験だけ
#   powershell -ExecutionPolicy Bypass -File test\run.ps1 -Update       ゴールデン（test\golden\）を今の結果で書き換える
#   powershell -ExecutionPolicy Bypass -File test\run.ps1 -Show         画面のあるブラウザで開く（開発者ツールで中を見るとき）
#   -Browser chrome | edge | <exe のパス>                               既定は Chrome があれば Chrome、なければ Edge
#
# 仕組み: testbook.html の <script id="tb-app"> の手前に harness.js と tests\*.js を差し込んだページを一時フォルダに作り、
# ブラウザで開く。試験はアプリと同じスコープで動き、結果を console.log に出す。それをブラウザのログから拾う。
# ゴールデンの日時は日本時間で作ってある。Windows のブラウザは環境変数 TZ を見ないので、PC のタイムゾーンに従う。
param(
  [switch]$Update,
  [string]$Filter = '',
  [switch]$Show,
  [string]$Browser = 'auto',
  [int]$TimeoutSec = 120
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$utf8 = New-Object Text.UTF8Encoding($false)
$toUrl = { param($p) 'file:///' + ((Resolve-Path $p).Path -replace '\\', '/') }

# ブラウザを探す
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
$candidates = switch ($Browser) { 'auto' { $chrome + $edge } 'chrome' { $chrome } 'edge' { $edge } default { @($Browser) } }
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw "ブラウザが見つかりません（$Browser）。Chrome か Edge を入れるか、-Browser でパスを指定してください" }

# 試験用のページを作る
$html = [IO.File]::ReadAllText((Join-Path $root 'testbook.html'), $utf8)
$at = $html.IndexOf('<script id="tb-app">')
if ($at -lt 0) { throw 'testbook.html に <script id="tb-app"> がありません' }
$inject = New-Object Text.StringBuilder
$goldenDir = Join-Path $PSScriptRoot 'golden'
if (-not (Test-Path $goldenDir)) { New-Item -ItemType Directory $goldenDir | Out-Null }
foreach ($g in Get-ChildItem $goldenDir -File | Sort-Object Name) {
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($g.FullName))
  [void]$inject.Append('<script type="text/plain" class="tb-test-golden" data-name="').Append($g.Name).Append('">').Append($b64).Append('</script>').Append("`n")
}
# リポジトリの文書も埋め込む（版と CHANGELOG、README の日英がずれていないかを試験が見る）
foreach ($name in 'README.md', 'README.ja.md', 'CHANGELOG.md', 'LICENSE') {
  $p = Join-Path $root $name
  if (Test-Path $p) {
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p))
    [void]$inject.Append('<script type="text/plain" class="tb-test-doc" data-name="').Append($name).Append('">').Append($b64).Append('</script>').Append("`n")
  }
}
# samples\*.html も埋め込む。試験が「今のアプリから作ったもの」と比べ、ずれていれば -Update で作り直す
$sampleDir = Join-Path $root 'samples'
if (-not (Test-Path $sampleDir)) { New-Item -ItemType Directory $sampleDir | Out-Null }
foreach ($s in Get-ChildItem $sampleDir -Filter *.html | Sort-Object Name) {
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($s.FullName))
  [void]$inject.Append('<script type="text/plain" class="tb-test-sample" data-name="').Append($s.Name).Append('">').Append($b64).Append('</script>').Append("`n")
}
$upd = if ($Update) { '1' } else { '0' }
[void]$inject.Append('<script charset="utf-8" src="').Append((& $toUrl (Join-Path $PSScriptRoot 'harness.js'))).Append('" data-update="').Append($upd).Append('" data-filter="').Append([Net.WebUtility]::HtmlEncode($Filter)).Append('"></script>').Append("`n")
foreach ($t in Get-ChildItem (Join-Path $PSScriptRoot 'tests') -Filter *.js | Sort-Object Name) {
  [void]$inject.Append('<script charset="utf-8" src="').Append((& $toUrl $t.FullName)).Append('"></script>').Append("`n")
}
$work = Join-Path $env:TEMP ('tb-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $work | Out-Null
$page = Join-Path $work 'testbook.test.html'
[IO.File]::WriteAllText($page, $html.Substring(0, $at) + $inject.ToString() + $html.Substring($at), $utf8)

# ブラウザで開く
$userDir = Join-Path $work 'profile'
$log = Join-Path $work 'browser.log'
$bArgs = @('--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', "--user-data-dir=$userDir",
  '--enable-logging=stderr', '--v=0', '--window-size=1400,900', (& $toUrl $page))
if ($Show) { $bArgs += '--auto-open-devtools-for-tabs' } else { $bArgs = @('--headless=new') + $bArgs }
$p = Start-Process -FilePath $exe -ArgumentList $bArgs -RedirectStandardError $log -PassThru -WindowStyle Hidden
Write-Host ('ブラウザ: ' + $exe)

$start = Get-Date
$done = $false
while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
  Start-Sleep -Milliseconds 300
  if ((Test-Path $log) -and (Select-String -Path $log -Pattern 'TBTEST_DONE' -Quiet)) { $done = $true; break }
  if ($Show -and $p.HasExited) { break }
}
if (-not $Show) {
  $exeName = Split-Path $exe -Leaf
  Get-CimInstance Win32_Process -Filter "Name = '$exeName'" | Where-Object { $_.CommandLine -like "*$userDir*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
}

# 結果を読む。ログの行は  [..] "TBTEST ok 名前", source: ...  の形。NG の理由は TBMSG の行で続く
$lines = if (Test-Path $log) { [IO.File]::ReadAllLines($log, $utf8) } else { @() }
$msgs = @($lines | ForEach-Object { if ($_ -match '^\[[^\]]*\] "(TBTEST|TBMSG|TBGOLDEN|TBFILE|TBTEST_DONE) (.*)", source: ') { @{ tag = $Matches[1]; text = $Matches[2] } } })
$failed = 0
foreach ($m in $msgs) {
  if ($m.tag -eq 'TBTEST') {
    if ($m.text -like 'ok *') { Write-Host ('  ok   ' + $m.text.Substring(3)) }
    else { $failed++; Write-Host ('  NG   ' + $m.text.Substring(3)) -ForegroundColor Red }
  }
  elseif ($m.tag -eq 'TBMSG') { Write-Host ('         ' + $m.text) -ForegroundColor DarkGray }
}
$goldens = @($msgs | Where-Object { $_.tag -eq 'TBGOLDEN' } | ForEach-Object { $_.text })
# 書いてほしいファイル（samples\）。1行が長くなりすぎないように「名前 i/n 中身」で分けて来るので、名前ごとにつなぐ
$files = [ordered]@{}
foreach ($m in @($msgs | Where-Object { $_.tag -eq 'TBFILE' })) {
  $name, $part, $chunk = $m.text -split ' ', 3
  if (-not $files.Contains($name)) { $files[$name] = New-Object Text.StringBuilder }
  [void]$files[$name].Append($chunk)
}
if ($Update) {
  foreach ($g in $goldens) {
    $name, $b64 = $g -split ' ', 2
    [IO.File]::WriteAllBytes((Join-Path $goldenDir $name), [Convert]::FromBase64String($b64))
    Write-Host ('  書き換え: test\golden\' + $name)
  }
  foreach ($name in $files.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $sampleDir $name), [Convert]::FromBase64String($files[$name].ToString()))
    Write-Host ('  書き換え: samples\' + $name)
  }
}
if (-not $done) {
  Write-Host ('試験が終わりませんでした（' + $TimeoutSec + ' 秒）。ブラウザのログ: ' + $log) -ForegroundColor Red
  $lines | Where-Object { $_ -match 'CONSOLE|ERROR' } | Select-Object -Last 20 | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor DarkGray }
  exit 2
}
$summary = ($msgs | Where-Object { $_.tag -eq 'TBTEST_DONE' } | Select-Object -First 1).text -split ' '
if ($failed) {
  Write-Host ("`n" + $summary[0] + ' 件 OK、' + $failed + ' 件 NG') -ForegroundColor Red
  if (($goldens.Count -or $files.Count) -and -not $Update) { Write-Host 'ゴールデンやサンプルの違いは -Update を付けると今の結果で書き換えます' }
  Write-Host ('ブラウザのログ: ' + $log)
  exit 1
}
Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
Write-Host ("`n" + $summary[0] + ' 件 OK')
exit 0
