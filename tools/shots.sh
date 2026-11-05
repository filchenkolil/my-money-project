#!/usr/bin/env bash
# Снимки экранов приложения (390x844, светлая и тёмная темы) в папку .shots/. Нужен сервер: tools/serve.ps1.
# 1) страница tests/shots.html проходит сценарии и сохраняет слепки; 2) Chrome снимает каждый слепок.
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/.shots"
rm -rf "$OUT"; mkdir -p "$OUT"
PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$(cygpath -w "$PROFILE")" "http://localhost:8765/tests/shots.html" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 60); do [ -s "$OUT/settings.html" ] && break; sleep 1; done
sleep 1; kill $PID 2>/dev/null; taskkill //F //PID $PID >/dev/null 2>&1
[ -s "$OUT/settings.html" ] || { echo "Слепки не получены"; ls "$OUT"; exit 2; }
for f in "$OUT"/*.html; do
  n="$(basename "$f" .html)"
  for theme in light dark; do
    P="$(mktemp -d)"
    "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir="$(cygpath -w "$P")" --window-size=500,844 --force-device-scale-factor=2 \
      --blink-settings=preferredColorScheme=$([ $theme = dark ] && echo 0 || echo 1) \
      --screenshot="$(cygpath -w "$OUT/$n-$theme.png")" "http://localhost:8765/tests/frame.html?n=$n" >/dev/null 2>&1
  done
done
ls "$OUT"/*.png
