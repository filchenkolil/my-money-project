#!/usr/bin/env bash
# Запуск тестов в Chrome. Нужен локальный сервер: powershell -File tools/serve.ps1 (порт 8765).
# Страница тестов отправляет итог на сервер, скрипт ждёт файл с результатом и печатает его.
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
URL="${URL:-http://localhost:8765/tests/index.html}"
DIR="$(cd "$(dirname "$0")" && pwd)"
RESULT="$DIR/.test-result.txt"
rm -f "$RESULT"
PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$(cygpath -w "$PROFILE" 2>/dev/null || echo "$PROFILE")" "$URL" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 90); do [ -s "$RESULT" ] && break; sleep 1; done
kill $PID 2>/dev/null; taskkill //F //PID $PID >/dev/null 2>&1
if [ ! -s "$RESULT" ]; then echo "Тесты не вернули результат за 90 секунд"; exit 2; fi
cat "$RESULT"; echo
grep -q "ошибок 0" "$RESULT"
