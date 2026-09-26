#!/usr/bin/env sh
# Starts Toolz Baba on http://127.0.0.1:8000  (macOS / Linux). Uses .venv if you created one.
cd "$(dirname "$0")" || exit 1
PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
echo "Open http://127.0.0.1:8000   (Ctrl+C to stop)"
exec "$PY" -m uvicorn main:app --port 8000
