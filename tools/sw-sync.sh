#!/usr/bin/env bash
# Обновляет в sw.js номер версии (из js/version.js) и список файлов для работы без интернета.
# Запускать перед каждой публикацией: tools/sw-sync.sh
set -e
cd "$(dirname "$0")/.."
VER="$(sed -n "s/.*VERSION = '\([0-9.]*\).*/\1/p" js/version.js | head -1)"
[ -n "$VER" ] || { echo "Не нашла номер версии в js/version.js"; exit 1; }
LIST="$( { find js css fonts -type f; echo icons/icon-180.png; echo icons/icon-192.png; echo icons/icon-512.png; echo beta/index.html; echo beta/manifest.webmanifest; [ -f manifest.webmanifest ] && echo manifest.webmanifest; echo index.html; } | sort | sed "s#.*#  '&',#" )"
awk -v ver="$VER" -v list="$LIST" '
  /VERSION-START/ { print "/* VERSION-START */ const VERSION = \x27" ver "\x27; /* VERSION-END */"; next }
  /FILES-START/ { print; print list; skip=1; next }
  /FILES-END/ { skip=0 }
  !skip { print }
' sw.js > sw.js.tmp && mv sw.js.tmp sw.js
echo "sw.js: версия $VER, файлов в списке: $(echo "$LIST" | wc -l)"
