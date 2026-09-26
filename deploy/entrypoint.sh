#!/bin/sh
# Container start: refresh yt-dlp (video sites change often), then run the app.
if [ "${AUTO_UPDATE_YTDLP:-1}" = "1" ]; then
  timeout 90 pip install --user --quiet --no-warn-script-location -U yt-dlp \
    || echo "yt-dlp update skipped (offline or slow); using the version built into the image"
fi
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
