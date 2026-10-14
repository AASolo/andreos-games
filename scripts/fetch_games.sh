#!/usr/bin/env bash
# Скачивает свежие версии игр с GitHub в app/src/main/assets/games
# и кладёт рядом библиотеки (three.js, Pyodide), чтобы игры работали без интернета.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/app/src/main/assets/games"
OWNER="AASolo"
GAMES=(doroga-v-okean ButerBashnya-1.0 kimchi-gleba HackQuest-3.0)
# Игры, которые лежат прямо в этом репозитории (папка games-local)
LOCAL=(BlockFlip)
HOST="https://appassets.androidplatform.net/assets/games"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rm -rf "$DEST"
mkdir -p "$DEST"

for g in "${GAMES[@]}"; do
  echo "→ $g"
  git clone -q --depth 1 "https://github.com/$OWNER/$g.git" "$TMP/$g"
  rm -rf "$TMP/$g/.git"
  cp -r "$TMP/$g" "$DEST/$g"
done

for g in "${LOCAL[@]}"; do
  echo "→ $g (из games-local)"
  cp -r "$ROOT/games-local/$g" "$DEST/$g"
done

( cd "$TMP" && npm pack --silent three@0.160.0 pyodide@0.26.4 >/dev/null )

# Дорога в океан: three.js локально
mkdir -p "$TMP/three"
tar xzf "$TMP/three-0.160.0.tgz" -C "$TMP/three"
cp "$TMP/three/package/build/three.min.js" "$DEST/doroga-v-okean/three.min.js"
sed -i 's#https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js#three.min.js#g' \
  "$DEST/doroga-v-okean/index.html"

# HackQuest: Pyodide локально (грузится из воркера, поэтому нужен полный адрес)
mkdir -p "$TMP/pyodide" "$DEST/HackQuest-3.0/pyodide"
tar xzf "$TMP/pyodide-0.26.4.tgz" -C "$TMP/pyodide"
for f in pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json; do
  cp "$TMP/pyodide/package/$f" "$DEST/HackQuest-3.0/pyodide/"
done
sed -i "s#https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js#$HOST/HackQuest-3.0/pyodide/pyodide.js#g" \
  "$DEST/HackQuest-3.0/index.html"

# Шрифты Google Fonts: локальные копии, чтобы игры выглядели так же без интернета
for g in "${GAMES[@]}" "${LOCAL[@]}"; do
  python3 "$ROOT/scripts/localize_fonts.py" "$DEST/$g"
done

# Мост Andreos Play: игры сообщают приложению о рекордах и пройденных уровнях
for g in "${GAMES[@]}" "${LOCAL[@]}"; do
  f="$DEST/$g/index.html"
  grep -q '</head>' "$f" || { echo "Нет </head> в $f" >&2; exit 1; }
  sed -i 's#</head>#<script src="../../andreos-bridge.js" defer></script></head>#' "$f"
done

# Проверка: игры ничего не грузят из интернета (CDN, шрифты)
if grep -lE 'cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.|fonts\.googleapis\.com|fonts\.gstatic\.com' "$DEST"/*/index.html; then
  echo "Остались ссылки на интернет, обнови scripts/fetch_games.sh" >&2
  exit 1
fi
du -sh "$DEST"
