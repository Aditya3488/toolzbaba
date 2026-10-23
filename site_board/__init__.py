"""Site Map Board: crawl a website into a Miro-style board (pages, funnel, tracking, SEO, catalogue) with a free offline Q&A bot.

Standard library only. Entry points:
  python -m site_board <url>      build a board HTML file
  python -m site_board serve      local web app
  site_board.api.router           FastAPI routes (/site-board, /api/site-board/*) for main.py
"""
from .bot import SiteBot  # noqa: F401
from .crawl import build_report  # noqa: F401
from .render import render  # noqa: F401
