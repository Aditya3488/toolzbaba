"""All deployment settings come from environment variables (see .env.example)."""
import os
import secrets
import sys
from pathlib import Path


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


SITE_NAME = os.environ.get("SITE_NAME", "Toolz Baba")
SITE_URL_SET = bool(os.environ.get("SITE_URL"))  # when set, hosted-image links always use it
SITE_URL = os.environ.get("SITE_URL", "http://127.0.0.1:8000").rstrip("/")
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "hello@example.com")
TAGLINE = os.environ.get("SITE_TAGLINE", "Free online image, PDF, video and file tools")

# open = anyone can use the downloader (fine at home) | password = login needed | off = disabled
DOWNLOADER_MODE = os.environ.get("DOWNLOADER_MODE", "open").strip().lower()
DOWNLOADER_PASSWORD = os.environ.get("DOWNLOADER_PASSWORD", "")


def _placeholder(v: str) -> bool:
    """Values copied straight from .env.example: never accept them as real secrets."""
    return v.startswith(("change-this", "paste-"))


if _placeholder(DOWNLOADER_PASSWORD):
    print("WARNING: DOWNLOADER_PASSWORD is still the example value; the downloader stays OFF until you change it.", file=sys.stderr)
    DOWNLOADER_PASSWORD = ""
if DOWNLOADER_MODE not in ("open", "password", "off"):
    DOWNLOADER_MODE = "open"
if DOWNLOADER_MODE == "password" and not DOWNLOADER_PASSWORD:
    DOWNLOADER_MODE = "off"  # never leave a "password" gate without a password

# Behind Caddy / Cloudflare the real visitor IP arrives in headers; only trust them when told to.
TRUSTED_PROXY = _bool("TRUSTED_PROXY", False)
RATE_LIMIT = _bool("RATE_LIMIT", True)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "2100"))  # whole request; per-tool limits are stricter
ADMIN_KEY = "" if _placeholder(os.environ.get("ADMIN_KEY", "")) else os.environ.get("ADMIN_KEY", "")  # lets you delete any hosted image (see DEPLOY.md)
HEAD_EXTRA = os.environ.get("HEAD_EXTRA", "")  # raw HTML for every <head>: analytics, AdSense verification...


def _secret() -> str:
    env = os.environ.get("SECRET_KEY", "")
    if env and not _placeholder(env):
        return env
    data = Path(os.environ.get("DATA_DIR", Path(__file__).parent / "data"))
    data.mkdir(parents=True, exist_ok=True)
    f = data / "secret.key"  # generated once so logins survive restarts
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text().strip()


SECRET_KEY = _secret()
