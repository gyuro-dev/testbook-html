#!/usr/bin/env bash
# CHANGELOG.md から、指定した版の節だけを取り出してリリースのノートにする。
#   bash .github/scripts/release_notes.sh 0.1.0
# 節がなければ 1 で終わる（公開を止めるため）。
set -euo pipefail
v=${1:?版を指定してください（例: 0.1.0）}
file=$(dirname "$0")/../../CHANGELOG.md
notes=$(awk -v v="$v" '
  $0 ~ "^## \\[" v "\\]" { on = 1; next }
  on && /^## \[/ { on = 0 }
  on && /^\[.*\]: http/ { on = 0 }
  on { print }
' "$file" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  echo "CHANGELOG.md に ## [$v] の節がありません" >&2
  exit 1
fi
printf '%s\n' "$notes"
