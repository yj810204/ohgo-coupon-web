# URL 전환 체크리스트 (Vercel → Vultr)

| 용도 | 이전 | 이후 |
|------|------|------|
| 웹 프로덕션 | `https://ohgo-coupon-web2.vercel.app` | `https://ohgo.codejaka.com` |
| `NEXT_PUBLIC_SITE_URL` | (Vercel URL) | `https://ohgo.codejaka.com` |
| Expo WebView | `EXPO_PUBLIC_WEB_URL` | `https://ohgo.codejaka.com` |
| portfolio-studio 캡처 | `projects/ohgo-coupon/manifest.yaml` `capture.baseUrl` | `https://ohgo.codejaka.com` |

## Supabase Dashboard

Authentication → URL Configuration → Redirect URLs:

- `https://ohgo.codejaka.com/**`

Site URL도 `https://ohgo.codejaka.com` 으로 맞추는 것을 권장.

## Expo 적용

```bash
cd mobile
# EXPO_PUBLIC_USE_HOSTED=true 로 호스팅 테스트
npx expo start -c
```
