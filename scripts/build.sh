#!/usr/bin/env bash
# 公式 draw.io (バージョン固定) から配信用の静的ファイル一式 dist/ を生成し、
# IIS 配置用 drawio-poc-iis.zip を作成する。
#   DRAWIO_SRC=<既存clone> を指定すると取得をスキップできる (ローカル検証用)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=../drawio-version.env
source drawio-version.env

SRC="${DRAWIO_SRC:-$ROOT/build/drawio}"
DIST="$ROOT/dist"

if [ -z "${DRAWIO_SRC:-}" ]; then
  rm -rf "$SRC"
  git clone --quiet --depth 1 --branch "$DRAWIO_TAG" "$DRAWIO_REPO" "$SRC"
fi

ACTUAL="$(git -C "$SRC" rev-parse HEAD)"
if [ "$ACTUAL" != "$DRAWIO_COMMIT" ]; then
  echo "ERROR: $DRAWIO_TAG のコミットが固定値と一致しません: $ACTUAL != $DRAWIO_COMMIT" >&2
  exit 1
fi

rm -rf "$DIST" drawio-poc-iis.zip
mkdir -p "$DIST"

# 公式 webapp をそのまま取り込む。閉域では使わないクラウド連携・PWA・
# Confluence 連携・サーバー側 (Java) 資材のみ除外する。
cp -a "$SRC/src/main/webapp/." "$DIST/"
(cd "$DIST" && rm -rf WEB-INF META-INF connect service-worker.js* workbox-* \
  dropbox.html github.html gitlab.html onedrive3.html teams.html \
  monday-app-association.json js/integrate.min.js)

# 設定は公式が用意している設定ファイルの差し替えで行う (公式コードは無改変)
cp config/PreConfig.js config/PostConfig.js "$DIST/js/"
cp config/web.config "$DIST/web.config"

# 閉域環境での外部通信を CSP でも遮断する (index.html に meta として挿入)
CSP="$(tr -d '\n' < config/csp.txt | sed 's/  */ /g')"
python3 -I - "$DIST/index.html" "$CSP" <<'PY'
import sys
path, csp = sys.argv[1], sys.argv[2]
html = open(path, encoding="utf-8").read()
tag = '<meta http-equiv="Content-Security-Policy" content="%s">' % csp
marker = '<meta charset="utf-8">'
assert html.count(marker) == 1, "index.html の構造が想定と異なります"
open(path, "w", encoding="utf-8").write(html.replace(marker, marker + "\n    " + tag))
PY

# ライセンス・出所
cp "$SRC/LICENSE" "$DIST/LICENSE"
cp NOTICE.txt "$DIST/NOTICE.txt"
cat > "$DIST/BUILD-INFO.txt" <<INFO
draw.io source : $DRAWIO_REPO
tag            : $DRAWIO_TAG
commit         : $DRAWIO_COMMIT
drawio-poc     : $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)
INFO

(cd "$DIST" && zip -qr -X "$ROOT/drawio-poc-iis.zip" .)
echo "dist: $(find "$DIST" -type f | wc -l) files, $(du -sh "$DIST" | cut -f1)"
echo "zip : $(du -h drawio-poc-iis.zip | cut -f1)"
