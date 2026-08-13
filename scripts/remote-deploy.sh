#!/usr/bin/env bash
# ohgo.codejaka.com VPS 원격 배포 (rsync + Docker + Nginx)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-158.247.241.130}"
USER="${DEPLOY_USER:-root}"
PORT="${DEPLOY_PORT:-22}"
REMOTE_DIR="${DEPLOY_DIR:-/root/ohgo-coupon-web}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_OPTS=(-i "$SSH_KEY" -p "$PORT" -o StrictHostKeyChecking=accept-new)

echo "==> ohgo-coupon-web → ${USER}@${HOST}:${REMOTE_DIR}"

if [[ ! -f "${ROOT}/.env.production" ]]; then
  echo "ERROR: ${ROOT}/.env.production 없음"
  exit 1
fi

ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=15 "${USER}@${HOST}" "mkdir -p ${REMOTE_DIR}"

rsync -avz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'mobile/node_modules' \
  --exclude 'mobile/.expo' \
  --exclude 'mobile/dist' \
  --exclude 'mobile/ios' \
  --exclude 'mobile/android' \
  --exclude 'screenshots*' \
  --exclude 'screenshots-430x932' \
  --exclude 'public/games/**/node_modules' \
  --exclude '.vercel' \
  --exclude '.cursor' \
  --exclude '.env.local' \
  --exclude '*.log' \
  --exclude '*.plan.md' \
  "${ROOT}/" "${USER}@${HOST}:${REMOTE_DIR}/"

ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" bash -s <<REMOTE
set -euo pipefail
cd ${REMOTE_DIR}
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
cp deploy/nginx/ohgo.codejaka.com.conf /etc/nginx/sites-available/ohgo.codejaka.com
ln -sf /etc/nginx/sites-available/ohgo.codejaka.com /etc/nginx/sites-enabled/ohgo.codejaka.com
nginx -t
systemctl reload nginx
curl -sI http://127.0.0.1:3030 | head -1
curl -sI https://ohgo.codejaka.com | head -5
echo "==> Done. https://ohgo.codejaka.com"
REMOTE
