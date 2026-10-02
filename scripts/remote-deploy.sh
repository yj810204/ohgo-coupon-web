#!/usr/bin/env bash
# ohgo.codejaka.com 프로덕션 배포 (codejaka-mini, OrbStack Docker)
#
# 경로: Cloudflare → Vultr 141.164.41.171 (nginx 프론트 프록시) → codejaka-mini (119.198.229.248)
#       → codejaka-mini-nginx-1 → host.docker.internal:3030 → ohgo-coupon-web-web-1
#
# 사용:
#   scripts/remote-deploy.sh              # 배포
#   DRY_RUN=1 scripts/remote-deploy.sh    # rsync -n 만, 빌드 생략
#   FORCE=1 scripts/remote-deploy.sh      # 작업 트리 변경 또는 HEAD != origin/main 이어도 진행
#
# .env* 와 *.traineddata 는 절대 동기화하지 않는다. 미니가 자기 .env.production 을 가진다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-codejaka-mini}"          # ~/.ssh/config 별칭 (user codejaka)
REMOTE_DIR="${DEPLOY_DIR:-src/ohgo-coupon-web}" # 원격 홈 기준 상대 경로
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
SERVICE="${DEPLOY_SERVICE:-web}"
CONTAINER="${DEPLOY_CONTAINER:-ohgo-coupon-web-web-1}"
LOCAL_PORT="${DEPLOY_LOCAL_PORT:-3030}"
PUBLIC_URL="${DEPLOY_PUBLIC_URL:-https://ohgo.codejaka.com/}"
DRY_RUN="${DRY_RUN:-0}"
FORCE="${FORCE:-0}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
REMOTE_PATH='export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.orbstack/bin:$PATH"'

remote() {
  # 원격에서 zsh 로그인 셸로 실행 (비대화형 ssh 는 PATH 가 비어 있을 수 있음)
  ssh "${SSH_OPTS[@]}" "$HOST" "zsh -lc $(printf '%q' "${REMOTE_PATH}; $1")"
}

cd "$ROOT"
COMMIT="$(git rev-parse --short HEAD)"
echo "==> ohgo-coupon-web ${COMMIT} → ${HOST}:~/${REMOTE_DIR} (DRY_RUN=${DRY_RUN})"

# 1) git 상태 확인
git fetch -q origin main
if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "$FORCE" == "1" ]]; then
    echo "WARN: 커밋되지 않은 변경이 있지만 FORCE=1 로 진행"
  else
    echo "ERROR: 작업 트리에 커밋되지 않은 변경이 있다 (FORCE=1 로 무시 가능)"
    git status --short
    exit 1
  fi
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  if [[ "$FORCE" == "1" ]]; then
    echo "WARN: HEAD 가 origin/main 과 다르지만 FORCE=1 로 진행"
  else
    echo "ERROR: HEAD($(git rev-parse --short HEAD)) != origin/main($(git rev-parse --short origin/main)). push 먼저 (FORCE=1 로 무시 가능)"
    exit 1
  fi
fi

# 2) ssh 연결과 원격 디렉터리 확인
if ! remote "test -f ~/${REMOTE_DIR}/${COMPOSE_FILE} && test -f ~/${REMOTE_DIR}/${ENV_FILE} && command -v docker >/dev/null"; then
  echo "ERROR: ${HOST} 접속 실패, 또는 ~/${REMOTE_DIR} 에 ${COMPOSE_FILE}/${ENV_FILE}/docker 없음"
  exit 1
fi

# 3) 진행 중인 빌드가 있으면 중단 (OOM, 중복 빌드 방지)
RUNNING_BUILDS="$(remote "ps -axo pid,command | grep -E '[d]ocker(-compose| compose).* (build|up .*--build)|[d]ocker build|[d]ocker buildx build' || true")"
if [[ -n "$RUNNING_BUILDS" ]]; then
  echo "ERROR: ${HOST} 에서 이미 빌드가 진행 중이다:"
  echo "$RUNNING_BUILDS"
  exit 1
fi

# 4) 소스 동기화
RSYNC_FLAGS=(-rc --delete --itemize-changes)
[[ "$DRY_RUN" == "1" ]] && RSYNC_FLAGS+=(-n)
echo "==> rsync ${RSYNC_FLAGS[*]}"
rsync "${RSYNC_FLAGS[@]}" \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '*.traineddata' \
  --exclude '.env*' \
  --exclude 'mobile' \
  --exclude '.vercel' \
  --exclude 'screenshots-430x932' \
  --exclude '.DS_Store' \
  "${ROOT}/" "${HOST}:${REMOTE_DIR}/" | grep -v 'skipping non-regular file' || true

if [[ "$DRY_RUN" == "1" ]]; then
  echo "==> DRY_RUN=1: 빌드와 재시작은 생략. 위 목록이 비어 있으면 미니 소스가 로컬과 같다."
  exit 0
fi

# 5) 빌드 후 교체 (빌드가 실패하면 기존 컨테이너는 그대로 남는다)
DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"
echo "==> build ${SERVICE}"
remote "cd ~/${REMOTE_DIR} && ${DC} build ${SERVICE}"
echo "==> up -d ${SERVICE}"
remote "cd ~/${REMOTE_DIR} && ${DC} up -d ${SERVICE}"

# 6) 확인
echo "==> 확인"
sleep 5
remote "docker inspect ${CONTAINER} --format 'status={{.State.Status}} started={{.State.StartedAt}}'"
LOCAL_CODE=""
for _ in 1 2 3 4 5 6; do
  LOCAL_CODE="$(remote "curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:${LOCAL_PORT}/" || true)"
  [[ "$LOCAL_CODE" == "200" ]] && break
  sleep 5
done
PUBLIC_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$PUBLIC_URL" || true)"
echo "    mini 127.0.0.1:${LOCAL_PORT} → ${LOCAL_CODE}"
echo "    ${PUBLIC_URL} → ${PUBLIC_CODE}"
echo "    deployed commit: ${COMMIT}"
if [[ "$LOCAL_CODE" != "200" || "$PUBLIC_CODE" != "200" ]]; then
  echo "ERROR: 헬스 체크 실패. docker logs ${CONTAINER} 확인"
  exit 1
fi
echo "==> Done. ${PUBLIC_URL}"
