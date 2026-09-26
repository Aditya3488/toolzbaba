#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 server:  sudo bash setup-server.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run as root:  sudo bash setup-server.sh"; exit 1; }

echo "==> Updating the system"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades rsync

echo "==> Adding 2 GB swap (a safety net for big video/AI jobs)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall: only SSH, HTTP and HTTPS are open"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Automatic security updates + brute-force protection"
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now fail2ban

echo
echo "Done. Next: copy the project to /opt/toolzbaba, create .env, and run:"
echo "  cd /opt/toolzbaba && docker compose -f docker-compose.prod.yml up -d --build"
