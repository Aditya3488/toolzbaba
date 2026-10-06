#!/usr/bin/env sh
# Builds the small Node helper that lets yt-dlp download HD YouTube (macOS / Linux).
# Run once from anywhere, after `pip install -r requirements.txt`:   sh scripts/setup-pot-provider.sh
set -e
cd "$(dirname "$0")/.."

if [ -f pot-provider/server/build/main.js ]; then echo "Already built: pot-provider/server/build/main.js"; exit 0; fi
for tool in git node npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool is required (install it, then run this again). Node must be version 22 or newer."; exit 1; }
done

PY=python3
[ -x .venv/bin/python ] && PY=.venv/bin/python
# the helper server version must match the pip plugin version
VERSION=$("$PY" -m pip show bgutil-ytdlp-pot-provider 2>/dev/null | awk '/^Version:/ {print $2}')
[ -n "$VERSION" ] || { echo "Install the Python packages first:  pip install -r requirements.txt"; exit 1; }
echo "Building bgutil-ytdlp-pot-provider $VERSION ..."

rm -rf pot-provider
git clone --depth 1 --branch "$VERSION" https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git pot-provider
cd pot-provider/server
npm ci
npx tsc
echo "Done. The app starts this helper automatically."
