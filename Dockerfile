# syntax=docker/dockerfile:1

FROM python:3.12-slim

# - libreoffice-*: Word/Excel/PowerPoint -> PDF (adds ~500 MB; delete these lines if you don't need it)
# - fonts: so converted documents render text properly
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
       libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 app \
    && mkdir -p /tmp/vd_jobs /data && chown app:app /tmp/vd_jobs /data

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py config.py security.py pages.py core.py toolkit.py ./
COPY tools ./tools
COPY static ./static
COPY deploy/entrypoint.sh /entrypoint.sh
# strip Windows line endings if the file was edited on Windows, and make it runnable
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh && chown -R app:app /app

USER app
# DATA_DIR holds uploaded CDN images and downloaded AI models (mount a volume here)
ENV HOME=/home/app PYTHONUNBUFFERED=1 DATA_DIR=/data
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=4)"

ENTRYPOINT ["/entrypoint.sh"]
