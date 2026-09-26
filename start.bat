@echo off
rem Starts Toolz Baba on http://127.0.0.1:8000  (uses .venv if you created one)
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (set "PY=.venv\Scripts\python.exe") else (set "PY=python")
start "" http://127.0.0.1:8000
"%PY%" -m uvicorn main:app --port 8000
