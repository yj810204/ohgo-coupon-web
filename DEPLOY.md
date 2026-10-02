# 배포 가이드 (codejaka-mini, OrbStack Docker)

프로덕션: **https://ohgo.codejaka.com**

> Vercel 프로덕션 배포는 사용하지 않습니다 (무료 한도, 이중 과금 방지).
> 예전 Vultr 단독 서버(158.247.241.130, `/root/ohgo-coupon-web`)는 더 이상 쓰지 않습니다. 접속도 되지 않습니다.
> 참고: [VULTR.md](VULTR.md), [deploy/HOSTING_URLS.md](deploy/HOSTING_URLS.md) 는 예전 구성 기준일 수 있습니다.

## 현재 구성

```
사용자 → Cloudflare (ohgo A 레코드, 프록시)
      → Vultr 141.164.41.171 : nginx 프론트 프록시만 있음 (앱, Docker 없음)
          /etc/nginx/sites-enabled/kr-front.conf → proxy_pass https://src-7k2m.usedu.kr
      → src-7k2m.usedu.kr = 119.198.229.248 = codejaka-mini (Mac mini)
          OrbStack Docker
          codejaka-mini-nginx-1 (80/443, ~/src/codejaka-mini/nginx/conf.d/ohgo.codejaka.com.conf)
            → proxy_pass http://host.docker.internal:3030
          ohgo-coupon-web-web-1 (127.0.0.1:3030 → 3000)
```

- 접속: MacBook 에서 `ssh codejaka-mini` (`~/.ssh/config` 별칭, 사용자 `codejaka`). 비대화형 ssh 는 PATH 가 비어 있을 수 있으니 `zsh -lc "..."` 로 실행한다. docker 는 `/usr/local/bin/docker`, 컨텍스트는 `orbstack`.
- 앱 디렉터리: `~/src/ohgo-coupon-web` (= `/Users/codejaka/src/ohgo-coupon-web`). git 체크아웃이 아니다. MacBook 에서 rsync 로 올린다.
- compose 프로젝트: `ohgo-coupon-web`, 파일 `docker-compose.prod.yml`, 서비스 `web`, 컨테이너 `ohgo-coupon-web-web-1`.
- 같은 미니에 다른 프로젝트(seonsa, trading-exec-point, codejaka-mini 등)가 함께 돈다. ohgo 서비스 외에는 건드리지 않는다.
- Vultr 프론트 nginx 와 미니의 nginx 컨테이너 설정은 이 저장소의 배포 스크립트가 바꾸지 않는다. `deploy/nginx/ohgo.codejaka.com.conf` 는 예전 단독 서버용 참고본이다.

## 필수 Environment Variables

codejaka-mini 의 `~/src/ohgo-coupon-web/.env.production`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://ohgo.codejaka.com`
- (선택) `LEGACY_LOGIN_SECRET`
- (선택) `RECONCILE_SECRET` — 승선 대사 API (`POST /api/admin/reconcile-boarding`). 없으면 해당 API는 거부한다.
- (선택) `BAND_CLIENT_ID`, `BAND_CLIENT_SECRET`, `BAND_REDIRECT_URI` — 밴드 Open API OAuth. 서버 전용. 콜백은 `https://ohgo.codejaka.com/api/band/callback`. 발급 전에도 이 주소는 안내 페이지로 열린다. 연동 시작은 관리자 로그인 후 `GET /api/band/authorize`. 토큰은 `band_oauth_tokens`에만 저장한다.

템플릿: [`.env.production.example`](.env.production.example)

`NEXT_PUBLIC_*` 는 **이미지 빌드 시** 주입됩니다. env 변경 후 `--build` 재빌드.

## 배포

### 원칙

- 배포는 `main` 에 push 된 커밋만 한다. 스크립트는 작업 트리에 변경이 있거나 HEAD 가 `origin/main` 과 다르면 멈춘다 (`FORCE=1` 로 무시 가능, 권장하지 않음).
- `.env*` 는 절대 동기화하지 않는다. 미니가 자기 `.env.production` 을 가진다. env 를 바꿀 때는 미니에서 직접 고치고 다시 빌드한다.
- `kor.traineddata`, `eng.traineddata` 는 gitignore 대상이고 커밋하지 않는다. rsync 에서도 제외하며, 미니에 있는 파일을 그대로 쓴다.
- 빌드는 한 번에 하나만. 다른 `docker compose build` 나 `docker build` 가 돌고 있으면 기다린다 (메모리 부족, 중복 빌드 방지). 스크립트가 확인한다.

### 스크립트

MacBook 저장소 루트에서:

```bash
DRY_RUN=1 scripts/remote-deploy.sh   # rsync -n 으로 차이만 보기, 빌드 생략
scripts/remote-deploy.sh             # 동기화, 빌드, 교체, 확인
```

환경 변수로 바꿀 수 있는 값: `DEPLOY_HOST` (기본 `codejaka-mini`), `DEPLOY_DIR` (기본 `src/ohgo-coupon-web`, 원격 홈 기준), `COMPOSE_FILE`, `ENV_FILE`, `DEPLOY_SERVICE`, `DEPLOY_CONTAINER`, `DEPLOY_LOCAL_PORT`, `DEPLOY_PUBLIC_URL`, `DRY_RUN`, `FORCE`.

`-t` 없이 `-rc` 로 비교하므로 `.f..T....` 처럼 시간(T)만 다른 줄은 내용이 같은 파일이다.

### 수동 절차 (스크립트와 같은 동작)

```bash
# 1) 소스 동기화 (MacBook 저장소 루트)
rsync -rc --delete -e "ssh -o BatchMode=yes" \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '*.traineddata' --exclude '.env*' --exclude mobile \
  --exclude .vercel --exclude screenshots-430x932 --exclude .DS_Store \
  ./ codejaka-mini:src/ohgo-coupon-web/

# 2) 빌드 후 교체 (빌드가 실패하면 기존 컨테이너는 그대로 남는다)
ssh codejaka-mini 'zsh -lc "cd ~/src/ohgo-coupon-web \
  && docker compose -f docker-compose.prod.yml --env-file .env.production build web \
  && docker compose -f docker-compose.prod.yml --env-file .env.production up -d web"'
```

### 확인 목록

- `ssh codejaka-mini 'zsh -lc "docker ps --filter name=ohgo-coupon-web-web-1"'` 에서 Up, 시작 시각이 방금
- 미니에서 `curl -sI http://127.0.0.1:3030/` → 200
- `curl -sI https://ohgo.codejaka.com/main` → 200
- 바꾼 내용이 실제 응답(HTML, `/_next/static/...css` 등)에 들어 있는지
- MacBook `main` == `origin/main`, `DRY_RUN=1 scripts/remote-deploy.sh` 결과에 내용 차이 없음

### 되돌리기

미니 디렉터리는 git 이 아니므로 이전 커밋 소스를 다시 올려 빌드한다.

```bash
git switch --detach <이전 커밋>
FORCE=1 scripts/remote-deploy.sh     # HEAD != origin/main 이라 FORCE 필요
git switch main
```

정식으로는 `git revert` 커밋을 `main` 에 push 한 뒤 평소처럼 배포한다.

### 처음 설치할 때

```bash
cd ~/src/ohgo-coupon-web
cp .env.production.example .env.production   # 값 채우기
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`public/games/**/node_modules` 는 이미지에 포함되지 않습니다.

## Supabase Auth Redirect

- `https://ohgo.codejaka.com/**`

## Expo

`mobile/.env`:

```bash
EXPO_PUBLIC_WEB_URL=https://ohgo.codejaka.com
EXPO_PUBLIC_USE_HOSTED=1
```

변경 후 `npx expo start -c` 또는 EAS 재빌드.

## DNS

`ohgo.codejaka.com` A 레코드 → Cloudflare 프록시 → Vultr 프론트 141.164.41.171. 원본 앱은 codejaka-mini.

## TLS / Android WebView 연결 실패 (YE1 / YR1)

`ohgo.codejaka.com` 원본 인증서가 Let’s Encrypt **Generation Y (YE1/YR1)** 이면
Android WebView가 인증서 검증에 실패할 수 있습니다.

**현재 운영 우회:** Cloudflare DNS에서 `ohgo` A 레코드를 **프록시(오렌지 구름)** 로 두고,
엣지 인증서(Google Trust Services)를 쓰게 합니다. 앱 재빌드 없이 해결됩니다.

- Cloudflare 대시보드 → SSL/TLS → 암호화를 **Full** 또는 **Full (strict)** 권장  
  (Flexible 이면 HTTP→HTTPS 301 루프가 날 수 있음. Nginx는 `X-Forwarded-Proto` 를 보고 루프를 막도록 설정됨)
- 원본 LE 인증서 재발급만으로는 Gen Y를 피하기 어려울 수 있음 (2026-08 기준 classic도 YR1)

확인:

```bash
# 엣지(Cloudflare) — Google Trust / WE1 이면 OK
dig +short ohgo.codejaka.com @1.1.1.1
echo | openssl s_client -connect $(dig +short ohgo.codejaka.com @1.1.1.1 | head -1):443 \
  -servername ohgo.codejaka.com 2>/dev/null | openssl x509 -noout -issuer
```

원본 직접(그레이 구름) 시:

```bash
echo | openssl s_client -connect 141.164.41.171:443 -servername ohgo.codejaka.com 2>/dev/null \
  | openssl x509 -noout -issuer
# CN=YR1 / YE1 → WebView 위험
```

## Vercel 중단

- `vercel deploy --prod` 하지 않음
- 기존 `ohgo-coupon-web2.vercel.app` 트래픽은 DNS/앱 URL을 현재 호스팅으로 전환한 뒤 중단

## 승선 대사 (보고 전용)

컨테이너 안에는 cron이 없습니다. 호스트 crontab에서 `curl`로 호출합니다.  
기본은 보고만 하며, `apply: true`를 넣지 않으면 Firestore 회원 데이터를 바꾸지 않습니다.

```cron
# 출항 확정 30분 뒤 예시 — 1항차 06:00 확정 가정 → 06:30 KST = 21:30 UTC
30 21 * * * RECONCILE_SECRET=... /path/to/ohgo-coupon-web/scripts/reconcile-boarding.sh
# 매일 22:00 KST = 13:00 UTC
0 13 * * * RECONCILE_SECRET=... /path/to/ohgo-coupon-web/scripts/reconcile-boarding.sh
```

헤더: `x-reconcile-secret: $RECONCILE_SECRET`  
적용 모드는 기본값이 아닙니다. 과거 날짜 백필은 `scripts/backfill-reconcile-boarding.mjs` (기본 dry-run).
