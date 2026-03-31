#!/usr/bin/env bash
set -euo pipefail

echo "── Exsto Cura · n8n Self-Host Deploy ──"

if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! docker compose version &>/dev/null; then
  echo "ERROR: docker compose plugin not found"
  exit 1
fi

DEPLOY_DIR="/opt/n8n"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

if [ ! -f .env ]; then
  echo "ERROR: /opt/n8n/.env missing. Copy self-host/.env to VPS first."
  exit 1
fi

source .env

if [ "$N8N_ENCRYPTION_KEY" = "GENERATE_WITH_openssl_rand_hex_32" ]; then
  NEW_KEY=$(openssl rand -hex 32)
  sed -i "s/GENERATE_WITH_openssl_rand_hex_32/$NEW_KEY/" .env
  echo "Generated encryption key: $NEW_KEY"
  echo "BACK THIS UP. Losing it means losing all stored credentials."
fi

echo "Pulling images..."
docker compose pull

echo "Starting n8n..."
docker compose up -d

echo ""
echo "── Deploy complete ──"
echo "n8n is running at https://$N8N_DOMAIN"
echo ""
echo "Next steps:"
echo "  1. Ensure DNS A record for $N8N_DOMAIN points to this server"
echo "  2. Visit https://$N8N_DOMAIN to create your owner account"
echo "  3. Create credentials: Gmail OAuth2, Anthropic, Notion, HoneyBook"
echo "  4. Note each credential ID from the URL bar"
echo "  5. Run migrate-to-selfhost.ps1 from your Windows machine"
