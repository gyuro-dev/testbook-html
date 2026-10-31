#!/usr/bin/env bash
# testbook の試験を、画面を出さない Chrome / Chromium / Edge で走らせる（macOS / Linux / WSL 用。Windows は test\run.ps1）。
#   bash test/run.sh                  全部走らせる
#   bash test/run.sh --filter マージ   名前に「マージ」を含む試験だけ
#   bash test/run.sh --update         ゴールデン（test/golden/）を今の結果で書き換える
#   bash test/run.sh --show           画面のあるブラウザで開く（開発者ツールで中を見るとき）
# ブラウザは google-chrome → chromium → Edge の順に探す。TB_BROWSER=/path/to/chrome で指定もできる。
# ゴールデンの日時は日本時間で作ってあるので、TZ が決まっていなければ Asia/Tokyo にする。
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
update=0; filter=''; show=0; timeout=120
while [ $# -gt 0 ]; do
  case "$1" in
    --update) update=1 ;;
    --filter) filter=$2; shift ;;
    --show) show=1 ;;
    --timeout) timeout=$2; shift ;;
    *) echo "知らない引数: $1" >&2; exit 2 ;;
  esac
  shift
done
export TZ="${TZ:-Asia/Tokyo}"

# ブラウザを探す
browser="${TB_BROWSER:-}"
if [ -z "$browser" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium" \
           "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
    if [ -x "$c" ] || command -v "$c" >/dev/null 2>&1; then browser=$c; break; fi
  done
fi
if [ -z "$browser" ]; then echo "Chrome / Chromium / Edge が見つかりません（TB_BROWSER=パス で指定できます）" >&2; exit 2; fi

# 試験用のページを作る: testbook.html の <script id="tb-app"> の手前に、ゴールデンと試験のスクリプトを差し込む
work=$(mktemp -d "${TMPDIR:-/tmp}/tb-test-XXXXXX")
inject="$work/inject.html"
: > "$inject"
mkdir -p "$here/golden"
for g in "$here"/golden/*; do
  [ -f "$g" ] || continue
  printf '<script type="text/plain" class="tb-test-golden" data-name="%s">%s</script>\n' "$(basename "$g")" "$(base64 < "$g" | tr -d '\n')" >> "$inject"
done
# リポジトリの文書も埋め込む（版と CHANGELOG、README の日英がずれていないかを試験が見る）
for d in README.md README.ja.md CHANGELOG.md LICENSE; do
  [ -f "$root/$d" ] || continue
  printf '<script type="text/plain" class="tb-test-doc" data-name="%s">%s</script>\n' "$d" "$(base64 < "$root/$d" | tr -d '\n')" >> "$inject"
done
# samples/*.html も埋め込む。試験が「今のアプリから作ったもの」と比べ、ずれていれば --update で作り直す
mkdir -p "$root/samples"
for s in "$root"/samples/*.html; do
  [ -f "$s" ] || continue
  printf '<script type="text/plain" class="tb-test-sample" data-name="%s">%s</script>\n' "$(basename "$s")" "$(base64 < "$s" | tr -d '\n')" >> "$inject"
done
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }
printf '<script charset="utf-8" src="file://%s/harness.js" data-update="%s" data-filter="%s"></script>\n' "$here" "$update" "$(esc "$filter")" >> "$inject"
for t in "$here"/tests/*.js; do printf '<script charset="utf-8" src="file://%s"></script>\n' "$t" >> "$inject"; done
page="$work/testbook.test.html"
awk -v inj="$inject" '/^<script id="tb-app">/ { while ((getline l < inj) > 0) print l } { print }' "$root/testbook.html" > "$page"
grep -q 'harness.js' "$page" || { echo "testbook.html に <script id=\"tb-app\"> が見つかりません" >&2; exit 2; }

# ブラウザで開く
log="$work/browser.log"
args=(--disable-gpu --no-first-run --no-default-browser-check --disable-extensions "--user-data-dir=$work/profile"
      --enable-logging=stderr --v=0 --window-size=1400,900 --no-sandbox --disable-dev-shm-usage)
if [ "$show" = 1 ]; then args+=(--auto-open-devtools-for-tabs); else args=(--headless=new "${args[@]}"); fi
"$browser" "${args[@]}" "file://$page" >/dev/null 2> "$log" &
bpid=$!
echo "ブラウザ: $browser"
start=$(date +%s); done_=0
while [ $(( $(date +%s) - start )) -lt "$timeout" ]; do
  sleep 0.3
  if grep -q 'TBTEST_DONE' "$log" 2>/dev/null; then done_=1; break; fi
  if [ "$show" = 1 ] && ! kill -0 "$bpid" 2>/dev/null; then break; fi
done
if [ "$show" != 1 ]; then kill "$bpid" 2>/dev/null || true; pkill -P "$bpid" 2>/dev/null || true; sleep 0.5; fi

# 結果を読む。ログの行は  [..] "TBTEST ok 名前", source: ...  の形
pick() { sed -n "s/^\[[^]]*\] \"$1 \(.*\)\", source: .*$/\1/p" "$log"; }
failed=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  case "$line" in
    "ok "*) echo "  ok   ${line#ok }" ;;
    "NG "*) failed=$((failed + 1)); printf '\033[31m  NG   %s\033[0m\n' "${line#NG }" ;;
  esac
done < <(pick 'TBTEST')
# NG の理由は TBMSG で続く。NG の順に並べて出す
if [ "$failed" -gt 0 ]; then
  echo
  echo "---- NG の理由 ----"
  sed -n 's/^\[[^]]*\] "\(TBTEST NG .*\|TBMSG .*\)", source: .*$/\1/p' "$log" | sed -e 's/^TBTEST NG /\n■ /' -e 's/^TBMSG /    /'
fi
if [ "$update" = 1 ]; then
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    name=${line%% *}; data=${line#* }
    printf '%s' "$data" | base64 -d > "$here/golden/$name"
    echo "  書き換え: test/golden/$name"
  done < <(pick 'TBGOLDEN')
  # 書いてほしいファイル（samples/）。「名前 i/n 中身」で分けて来るので、名前ごとにつなぐ
  while IFS=' ' read -r name data; do
    [ -n "$name" ] || continue
    printf '%s' "$data" | base64 -d > "$root/samples/$name"
    echo "  書き換え: samples/$name"
  done < <(pick 'TBFILE' | awk '{ if (!($1 in f)) order[++n] = $1; f[$1] = f[$1] $3 } END { for (i = 1; i <= n; i++) print order[i] " " f[order[i]] }')
fi
if [ "$done_" != 1 ]; then
  echo "試験が終わりませんでした（${timeout} 秒）。ブラウザのログ: $log" >&2
  grep -E 'CONSOLE|ERROR' "$log" | tail -n 20 || true
  exit 2
fi
summary=$(pick 'TBTEST_DONE' | head -n 1)
pass=${summary%% *}
if [ "$failed" -gt 0 ]; then
  echo; printf '\033[31m%s 件 OK、%s 件 NG\033[0m\n' "$pass" "$failed"
  if [ "$update" != 1 ] && { pick 'TBGOLDEN'; pick 'TBFILE'; } | grep -q .; then echo "ゴールデンやサンプルの違いは --update を付けると今の結果で書き換えます"; fi
  echo "ブラウザのログ: $log"
  exit 1
fi
rm -rf "$work"
echo; echo "$pass 件 OK"
