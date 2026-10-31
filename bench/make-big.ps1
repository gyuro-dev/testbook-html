# 性能試験用の大きな testbook ファイルを作る。
#   powershell -ExecutionPolicy Bypass -File bench\make-big.ps1 -Rows 100000 -Images 0 -Out big.html
# -Measure を付けると、開いたときに時間とメモリを測ってコンソールに出すスクリプトを足す（bench\run-edge.ps1 で使う）。
param(
  [int]$Rows = 100000,
  [int]$Images = 0,
  [string]$Out = "big.html",
  [switch]$Measure
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$app = Join-Path $PSScriptRoot '..\testbook.html'
$html = [IO.File]::ReadAllText((Resolve-Path $app), [Text.Encoding]::UTF8)
$open = '<script id="tb-data" type="application/json">'
$i = $html.IndexOf($open)
$j = $html.IndexOf('</script>', $i)
$head = $html.Substring(0, $i + $open.Length)
$tail = $html.Substring($j + '</script>'.Length)   # tb-data の閉じタグより後ろ

$w = New-Object IO.StreamWriter((Join-Path (Get-Location) $Out), $false, (New-Object Text.UTF8Encoding($false)), 1048576)
$w.Write($head)

# データ（JSON）
$words = @('ログイン', '注文', '在庫', '支払い', '会員', '割引')
$kinds = @('画面', 'API', '帳票')
$verdicts = @('ok', 'ok', 'ok', 'ok', 'ng', 'hold', 'na')
$cols = '[{"id":"k_l1","name":"大項目","type":"level","w":110},{"id":"k_l2","name":"中項目","type":"level","w":110},{"id":"k_l3","name":"小項目","type":"level","w":110},' +
  '{"id":"k_t","name":"確認内容","type":"text","w":220},{"id":"k_p","name":"前提条件","type":"text","w":160},{"id":"k_s","name":"手順","type":"text","w":200},{"id":"k_e","name":"期待結果","type":"text","w":200},' +
  '{"id":"k_v","name":"結果","type":"verdict","w":76},{"id":"k_by","name":"実施者","type":"by","w":80},{"id":"k_at","name":"実施日","type":"at","w":124},{"id":"k_rm","name":"備考","type":"remark","w":180},{"id":"k_ev","name":"証跡","type":"evidence","w":56}]'
$w.Write('{"format":"testbook","version":2,"meta":{"id":"d_bench","title":"性能試験 ' + $Rows + '行 画像' + $Images + '枚","ts":{}},')
$w.Write('"sheets":[{"id":"s_1","name":"試験項目","kind":"cases","order":1,"columns":' + $cols + ',"ts":{},"updatedAt":0}],')
$w.Write('"runs":[{"id":"r_1","name":"1回目","order":1,"ts":{},"updatedAt":0}],"items":[')
$sb = New-Object Text.StringBuilder
for ($n = 0; $n -lt $Rows; $n++) {
  $a = $words[[math]::Floor($n / 400) % 6]; $b = $words[[math]::Floor($n / 40) % 6]; $k = $kinds[[math]::Floor($n / 8) % 3]
  $pre = if ($n % 3) { 'ログイン済み' } else { '一般会員でログイン済み\n在庫を10にしておく' }
  if ($n) { [void]$sb.Append(',') }
  [void]$sb.Append('{"id":"i_').Append($n).Append('","sheet":"s_1","order":').Append($n + 1).Append(',"ts":{},"updatedAt":0,"k_l1":"').Append($a).Append('機能","k_l2":"').Append($b).Append('の確認","k_l3":"').Append($k)
  [void]$sb.Append('","k_t":"').Append($words[$n % 6]).Append('の').Append($words[($n * 7) % 6]).Append('が正しく動くこと（No.').Append($n + 1).Append('）","k_p":"').Append($pre)
  [void]$sb.Append('","k_s":"1. ').Append($words[($n * 3) % 6]).Append('画面を開く\n2. ').Append($words[($n * 5) % 6]).Append('を入力する\n3. 保存を押す","k_e":"').Append($words[($n * 11) % 6]).Append('が保存され、一覧に表示される"}')
  if ($sb.Length -gt 4000000) { $w.Write($sb.ToString()); [void]$sb.Clear() }
}
$w.Write($sb.ToString()); [void]$sb.Clear()
$w.Write('],"records":[')
$first = $true
for ($n = 0; $n -lt $Rows; $n++) {
  if ($n % 10 -ge 7) { continue }
  if (-not $first) { [void]$sb.Append(',') }; $first = $false
  [void]$sb.Append('{"id":"rec_i_').Append($n).Append('_r_1","item":"i_').Append($n).Append('","run":"r_1","verdict":"').Append($verdicts[$n % 7]).Append('","by":"田中","at":"2026/10/29 10:00","remark":"","ts":{},"updatedAt":0}')
  if ($sb.Length -gt 4000000) { $w.Write($sb.ToString()); [void]$sb.Clear() }
}
$w.Write($sb.ToString()); [void]$sb.Clear()

# 画像: スクショらしい JPEG を8種類作り、使い回す
$imgs = @()
if ($Images -gt 0) {
  $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]85)
  $font = New-Object Drawing.Font('Meiryo', 20)
  for ($v = 0; $v -lt 8; $v++) {
    $bmp = New-Object Drawing.Bitmap(1280, 720); $g = [Drawing.Graphics]::FromImage($bmp)
    $g.Clear([Drawing.Color]::FromArgb(244, 246, 249))
    $rnd = New-Object Random($v)
    for ($q = 0; $q -lt 1500; $q++) {
      $br = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb($rnd.Next(256), $rnd.Next(256), $rnd.Next(256)))
      $g.FillRectangle($br, $rnd.Next(1280), $rnd.Next(720), 3 + $rnd.Next(40), 2 + $rnd.Next(18)); $br.Dispose()
    }
    for ($q = 0; $q -lt 14; $q++) { $g.DrawString("画面 $v-$q  確認内容のテキスト あいうえおかきくけこ", $font, [Drawing.Brushes]::Black, 40, 40 + $q * 46) }
    $ms = New-Object IO.MemoryStream; $bmp.Save($ms, $codec, $ep)
    $imgs += 'data:image/jpeg;base64,' + [Convert]::ToBase64String($ms.ToArray())
    $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
  }
}
$w.Write('],"elements":[')
$per = [math]::Max(1, [math]::Min($Rows, [math]::Ceiling($Images / 3)))
for ($e = 0; $e -lt $Images; $e++) {
  if ($e) { [void]$sb.Append(',') }
  [void]$sb.Append('{"id":"e_').Append($e).Append('","owner":"ev:i_').Append($e % $per).Append(':r_1","type":"image","z":').Append($e + 1).Append(',"x":24,"y":').Append(24 + [math]::Floor($e / $per) * 430).Append(',"w":720,"h":405,"name":"img').Append($e).Append('","nw":1280,"nh":720,"by":"佐藤","at":0,"ts":{},"updatedAt":0}')
}
$w.Write($sb.ToString()); [void]$sb.Clear()
$w.Write('],"conflicts":[]}')
$w.Write("</script>`n")
for ($e = 0; $e -lt $Images; $e++) { $w.Write('<script type="text/plain" class="tb-blob" data-id="e_' + $e + '">' + $imgs[$e % 8] + "</script>`n") }

if ($Measure) {
  # アプリが動き出した時点と、表示が終わった時点の時間・メモリを測り、編集などの時間も測ってコンソールに出す
  $probe = @'
<script>
(function () {
  const ready = performance.now();
  addEventListener('load', () => {
    const loaded = performance.now();
    setTimeout(() => {
      const mem = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      const time = f => { const s = performance.now(); f(); return Math.round((performance.now() - s) * 10) / 10; };
      const r = { appReadyMs: Math.round(ready), loadEventMs: Math.round(loaded), heapMB: mem(), rows: S.rows.length, images: D.elements.length };
      if (S.rows.length > 4) {
        S.me = 'x'; S.r = Math.floor(S.rows.length / 2); S.c = 4; collapse(); paintCursor();
        r.editFirstMs = time(() => { startEdit(true); ed().value += 'x'; commitEdit(); });
        r.editMs = time(() => { startEdit(true); ed().value += 'y'; commitEdit(); });
        time(() => { snap(); applyVerdict(S.rows[S.r + 1], 'ng'); afterChange(); });
        r.verdictMs = time(() => { snap(); applyVerdict(S.rows[S.r + 3], 'ng'); afterChange(); });
      }
      const wrap = $('#gridwrap'), ts = [];
      for (let i = 0; i < 30; i++) { wrap.scrollTop = Math.floor((wrap.scrollHeight - wrap.clientHeight) * ((i * 0.618) % 1)); ts.push(time(() => renderWindow(false))); }
      r.scrollMaxMs = Math.max(...ts);
      if (D.elements.length) { r.openBoardMs = time(() => openEvidence(D.elements[0].owner.split(':')[1])); closeEvidence(); }
      r.saveBlobMs = time(() => { r.fileMB = Math.round(fileBlob().size / 1048576); });
      r.heapAfterMB = mem();
      console.log('TBMETRICS ' + JSON.stringify(r));
    }, 500);
  });
})();
</script>
'@
  $tail = $tail.Replace('</body>', $probe + "`n</body>")
}
$w.Write($tail)
$w.Close()
$f = Get-Item (Join-Path (Get-Location) $Out)
"{0}  {1:N1} MB" -f $f.Name, ($f.Length / 1MB)
