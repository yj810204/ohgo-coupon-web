# 🚀 빠른 시작 가이드

## 1️⃣ 도메인 설정 (중요!)

`game.source.js` 파일을 열고 운영 도메인을 추가하세요:

```javascript
const allowedDomains = [
    'localhost',
    '127.0.0.1',
    'yourdomain.com',        // ← 실제 도메인으로 변경
    'www.yourdomain.com'     // ← 실제 도메인으로 변경
];
```

## 2️⃣ Node.js 설치

Node.js가 없다면 설치하세요: https://nodejs.org

## 3️⃣ 패키지 설치 (최초 1회만)

```bash
cd modules/cj_game/games/match3
npm install
```

## 4️⃣ 빌드

### Windows:
```bash
build.bat
```

### Linux/Mac:
```bash
./build.sh
```

## 5️⃣ 배포

`game.js` 파일만 서버에 업로드하세요.

❌ 업로드하지 말 것:
- `game.source.js`
- `node_modules/`
- `package.json`

## 📌 개발 시

1. `game.source.js` 수정
2. `npm run build` 실행
3. `game.js` 서버 업로드

자세한 내용은 `README.md`를 참고하세요.

