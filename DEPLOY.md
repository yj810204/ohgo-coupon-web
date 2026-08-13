# 배포 가이드 (Vultr Docker)

프로덕션: **https://ohgo.codejaka.com**  
호스트 바인드: `127.0.0.1:3030` → Nginx → 와일드카드 TLS (`codejaka-wildcard`)

> Vercel 프로덕션 배포는 사용하지 않습니다 (무료 한도·이중 과금 방지).  
> 통합 런북: [VULTR.md](VULTR.md) · URL 전환: [deploy/HOSTING_URLS.md](deploy/HOSTING_URLS.md)

## 필수 Environment Variables

VPS `.env.production`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL=https://ohgo.codejaka.com`
- (선택) `LEGACY_LOGIN_SECRET`

템플릿: [`.env.production.example`](.env.production.example)

`NEXT_PUBLIC_*` 는 **이미지 빌드 시** 주입됩니다. env 변경 후 `--build` 재빌드.

## VPS 배포

```bash
cd /path/to/ohgo-coupon-web
cp .env.production.example .env.production   # 최초 1회
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

sudo cp deploy/nginx/ohgo.codejaka.com.conf /etc/nginx/sites-available/ohgo.codejaka.com
sudo ln -sf /etc/nginx/sites-available/ohgo.codejaka.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

curl -I https://ohgo.codejaka.com
```

RAM이 빠듯하면 이 앱을 우선 올리고 `studio` 는 나중에 올려도 됩니다. `public/games/**/node_modules` 는 이미지에 포함되지 않습니다.

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

`ohgo.codejaka.com` A 레코드 → Vultr IP.

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
echo | openssl s_client -connect 158.247.241.130:443 -servername ohgo.codejaka.com 2>/dev/null \
  | openssl x509 -noout -issuer
# CN=YR1 / YE1 → WebView 위험
```

## Vercel 중단

- `vercel deploy --prod` 하지 않음
- 기존 `ohgo-coupon-web2.vercel.app` 트래픽은 DNS/앱 URL을 Vultr로 전환한 뒤 중단
