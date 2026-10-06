# Builds the small Node helper that lets yt-dlp download HD YouTube (Windows).
# Run once from the project root, after `pip install -r requirements.txt`:
#     powershell -ExecutionPolicy Bypass -File scripts\setup-pot-provider.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (Test-Path "pot-provider\server\build\main.js") { Write-Host "Already built: pot-provider\server\build\main.js"; exit 0 }
foreach ($tool in "git", "node", "npm") { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required (install it, then run this again). Node must be version 22 or newer." } }

# the helper server version must match the pip plugin version
$venvPy = if (Test-Path ".venv\Scripts\python.exe") { ".venv\Scripts\python.exe" } else { "python" }
$line = & $venvPy -m pip show bgutil-ytdlp-pot-provider | Select-String "^Version:"
if (-not $line) { throw "Install the Python packages first:  pip install -r requirements.txt" }
$version = $line.ToString().Split(" ")[-1].Trim()
Write-Host "Building bgutil-ytdlp-pot-provider $version ..."

if (Test-Path "pot-provider") { Remove-Item "pot-provider" -Recurse -Force }
git clone --depth 1 --branch $version https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git pot-provider
Set-Location "pot-provider\server"
npm ci
npx tsc
Write-Host "Done. The app starts this helper automatically."
