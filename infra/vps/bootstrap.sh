#!/usr/bin/env bash
# One-time VPS bootstrap for Sustenta Futuro (Ubuntu 24.04, runs as root).
#   curl/scp this file to the server, then: sudo bash bootstrap.sh
#
# Idempotent enough to re-run. Installs Caddy + Python + git, creates the
# 'sustenta' service user, and sets up a basic firewall. It does NOT deploy the
# app — see README.md step 4 for that.
set -euo pipefail

echo "==> Updating system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y

echo "==> Installing base packages"
apt-get install -y git ufw fail2ban python3.12 python3.12-venv curl debian-keyring debian-archive-keyring apt-transport-https

echo "==> Installing Caddy (official repo)"
if ! command -v caddy >/dev/null 2>&1; then
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -y && apt-get install -y caddy
fi

echo "==> Creating service user 'sustenta'"
id -u sustenta >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/sustenta --shell /usr/sbin/nologin sustenta
mkdir -p /opt/sustenta /var/www/sustenta/web
chown -R sustenta:sustenta /opt/sustenta /var/www/sustenta

echo "==> Firewall (SSH + HTTP + HTTPS only)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Done. Next: deploy the app (README.md step 4)."
