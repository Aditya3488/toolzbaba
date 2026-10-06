#!/usr/bin/env sh
# Starts the site the way Cloudflare serves it (static build + Functions + KV) on http://127.0.0.1:8000  (macOS / Linux).
# Needs Python and Node.js. (The old Python-only server is start-old-python-server.sh: it does not know the tab pages, /admin and the Functions.)
cd "$(dirname "$0")" || exit 1
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
"$PY" build.py || exit 1
command -v npx >/dev/null 2>&1 || { echo "Node.js is needed (https://nodejs.org)."; exit 1; }
echo "Open http://127.0.0.1:8000   (Ctrl+C to stop)"
exec npx wrangler pages dev dist --kv CDN --port 8000 --ip 127.0.0.1
