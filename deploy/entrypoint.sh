#!/bin/sh
# Container start: run the app.
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
