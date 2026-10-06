"""All deployment settings come from environment variables (see .env.example)."""
import os


def _bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


SITE_NAME = os.environ.get("SITE_NAME", "Toolz Baba")
SITE_URL_SET = bool(os.environ.get("SITE_URL"))  # when set, hosted-image links always use it
SITE_URL = os.environ.get("SITE_URL", "http://127.0.0.1:8000").rstrip("/")
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "hello@example.com")
TAGLINE = os.environ.get("SITE_TAGLINE", "Free online image, PDF, video and file tools")


def _placeholder(v: str) -> bool:
    """Values copied straight from .env.example: never accept them as real secrets."""
    return v.startswith(("change-this", "paste-"))


# Behind Caddy / Cloudflare the real visitor IP arrives in headers; only trust them when told to.
TRUSTED_PROXY = _bool("TRUSTED_PROXY", False)
RATE_LIMIT = _bool("RATE_LIMIT", True)
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "2100"))  # whole request; per-tool limits are stricter
ADMIN_KEY = "" if _placeholder(os.environ.get("ADMIN_KEY", "")) else os.environ.get("ADMIN_KEY", "")  # lets you delete any hosted image (see DEPLOY.md)
HEAD_EXTRA = os.environ.get("HEAD_EXTRA", "")  # raw HTML for every <head>: analytics, AdSense verification...
