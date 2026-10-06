@echo off
rem Starts the site the way Cloudflare serves it (the static build, its Functions and the KV storage) on http://127.0.0.1:8000
rem Needs Python and Node.js. The first run downloads wrangler (Cloudflare's tool), which takes a minute.
rem (The old Python-only server is in start-old-python-server.bat: it does not know the tab pages, /admin and the Functions.)
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (set "PY=.venv\Scripts\python.exe") else (set "PY=python")
"%PY%" build.py
if errorlevel 1 goto fail
where npx >nul 2>nul
if errorlevel 1 goto nonode
start "" cmd /c "timeout /t 10 >nul & start http://127.0.0.1:8000"
npx wrangler pages dev dist --kv CDN --port 8000 --ip 127.0.0.1
goto :eof
:fail
echo The build failed. Read the message above.
pause
goto :eof
:nonode
echo Node.js is needed (https://nodejs.org). Install it, then run start.bat again.
pause
