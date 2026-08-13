# Vultr 배포 안내

통합 런북(DNS·3앱·Nginx·Vercel 중단): 동일 내용이 `kiosk-pos-web/VULTR.md` 에 있습니다.

이 앱만:

- 도메인: **https://ohgo.codejaka.com**
- 포트: `127.0.0.1:3030`
- URL 전환: [deploy/HOSTING_URLS.md](deploy/HOSTING_URLS.md)
- 상세: [DEPLOY.md](DEPLOY.md)

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
sudo cp deploy/nginx/ohgo.codejaka.com.conf /etc/nginx/sites-available/ohgo.codejaka.com
sudo ln -sf /etc/nginx/sites-available/ohgo.codejaka.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
