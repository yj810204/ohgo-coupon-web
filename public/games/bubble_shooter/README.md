# 버블 슈터 게임 - 빌드 가이드

이 문서는 버블 슈터 게임의 개발 및 배포 프로세스를 설명합니다.

## 📁 파일 구조

```
modules/cj_game/games/bubble_shooter/
├── game.source.js          # 원본 소스 코드 (개발용, Git에 포함)
├── game.js                 # 난독화된 코드 (프로덕션용, Git에서 제외)
├── game.html               # 게임 HTML
├── game.css                # 게임 CSS
├── config.json             # 게임 설정
├── package.json            # npm 설정
├── obfuscator-config.json  # 난독화 설정
├── build.bat               # Windows 빌드 스크립트
├── build.sh                # Linux/Mac 빌드 스크립트
├── README.md               # 이 문서
└── assets/                 # 게임 리소스
    └── thumbnail.png       # 게임 썸네일
```

## 🎮 게임 설명

버블 슈터는 버블을 쏘아 올려 같은 색깔 3개 이상을 매치하여 제거하는 퍼즐 게임입니다.

### 게임 플레이
- 마우스나 터치로 조준선을 조절하여 버블을 발사합니다
- 같은 색깔의 버블 3개 이상이 연결되면 제거됩니다
- 제거된 버블 위의 버블은 중력에 의해 떨어집니다
- 연결이 끊어진 버블은 자동으로 제거됩니다
- 버블이 하단 경계선에 도달하면 게임이 종료됩니다

## 🔒 보안 기능

빌드된 `game.js`에는 다음 보안 기능이 포함됩니다:

### 1. 도메인 체크
- 특정 도메인에서만 게임이 실행되도록 제한
- 운영 도메인 설정: `game.source.js` 파일의 `allowedDomains` 배열 수정

```javascript
const allowedDomains = [
    'localhost',
    '127.0.0.1',
    'yourdomain.com',        // 실제 도메인으로 변경
    'www.yourdomain.com'     // 실제 도메인으로 변경
];
```

### 2. 안티 디버깅
- 개발자 도구가 열려있는지 주기적으로 감지
- 개발자 도구 사용 시 경고 표시 (선택적으로 차단 가능)

### 3. 코드 난독화
- 변수명/함수명 난독화
- 문자열 암호화
- 제어 흐름 평탄화
- 데드 코드 삽입
- 디버그 방지

### 4. 무결성 검증
- 코드 변조 감지
- 주기적으로 무결성 체크

## 🚀 빌드 프로세스

### 사전 요구사항

- **Node.js** (v14 이상)
- **npm** (Node.js와 함께 설치됨)

Node.js 다운로드: https://nodejs.org

### 초기 설정 (1회만)

1. 프로젝트 폴더로 이동:
```bash
cd modules/cj_game/games/bubble_shooter
```

2. 필요한 패키지 설치:
```bash
npm install
```

### 빌드 방법

#### Windows 사용자:
```bash
build.bat
```
또는
```bash
npm run build
```

#### Linux/Mac 사용자:
```bash
chmod +x build.sh    # 최초 1회만
./build.sh
```
또는
```bash
npm run build
```

### 빌드 결과

- `game.js` 파일이 생성됩니다 (난독화됨)
- 이 파일을 서버에 업로드하세요
- `game.source.js`는 개발용이므로 **서버에 업로드하지 마세요**

## 📝 개발 워크플로우

### 1. 코드 수정
- `game.source.js` 파일을 수정합니다
- 절대 `game.js`를 직접 수정하지 마세요 (빌드 시 덮어씌워짐)

### 2. 로컬 테스트
- 로컬 환경에서는 `game.source.js`를 직접 사용하여 테스트 가능
- 또는 빌드 후 `game.js`로 테스트

### 3. 빌드
```bash
npm run build
```

### 4. 배포
- `game.js` 파일만 서버에 업로드
- `game.source.js`, `node_modules/`, `package.json` 등은 업로드하지 않음

## 🔧 난독화 설정 변경

`obfuscator-config.json` 파일에서 난독화 옵션을 조정할 수 있습니다.

### 주요 옵션:

- `compact`: 코드 압축 (true/false)
- `controlFlowFlattening`: 제어 흐름 평탄화 (true/false)
- `deadCodeInjection`: 데드 코드 삽입 (true/false)
- `debugProtection`: 디버그 방지 (true/false)
- `stringArrayEncoding`: 문자열 인코딩 방식 (["base64"], ["rc4"], 등)

더 많은 옵션: https://github.com/javascript-obfuscator/javascript-obfuscator

### 주의사항:
- 난독화 수준이 높을수록 파일 크기가 증가하고 실행 속도가 느려질 수 있습니다
- 테스트를 통해 적절한 균형을 찾으세요

## ⚠️ 중요 사항

### 1. 원본 파일 관리
- `game.source.js`는 반드시 안전하게 보관하세요
- Git 저장소에 포함시켜 버전 관리하세요
- 난독화된 `game.js`는 디버깅이 불가능합니다

### 2. 도메인 설정
- 배포 전에 `game.source.js`의 `allowedDomains`에 운영 도메인을 추가하세요
- localhost는 개발용이므로 프로덕션에서는 제거를 고려하세요

### 3. Git 관리
- `.gitignore`에 `game.js`와 `node_modules/`가 포함되어 있는지 확인하세요
- 난독화된 파일은 Git에 커밋하지 마세요

### 4. 배포 체크리스트
- [ ] `allowedDomains`에 운영 도메인 추가
- [ ] `npm run build` 실행
- [ ] `game.js` 파일 생성 확인
- [ ] 난독화된 코드 테스트
- [ ] `game.js`만 서버에 업로드
- [ ] 운영 환경에서 정상 작동 확인

## 🐛 문제 해결

### "Node.js가 설치되어 있지 않습니다"
- Node.js를 https://nodejs.org 에서 다운로드하여 설치하세요

### "패키지 설치 실패"
- 인터넷 연결 확인
- `npm cache clean --force` 실행 후 다시 시도
- `node_modules` 폴더 삭제 후 `npm install` 재실행

### "빌드 실패"
- `game.source.js`에 문법 오류가 없는지 확인
- `obfuscator-config.json`이 올바른 JSON 형식인지 확인

### 게임이 "접근이 제한되었습니다" 표시
- `game.source.js`의 `allowedDomains`에 현재 도메인이 포함되어 있는지 확인
- 다시 빌드 후 업로드

## 📚 추가 자료

- **JavaScript Obfuscator**: https://github.com/javascript-obfuscator/javascript-obfuscator
- **Node.js 공식 문서**: https://nodejs.org/docs
- **npm 공식 문서**: https://docs.npmjs.com
- **Phaser3 공식 문서**: https://photonstorm.github.io/phaser3-docs/

## 💡 보안 강화 팁

### 1. 서버 사이드 검증 강화
- 점수 저장 시 서버에서 추가 검증 수행
- 점수의 합리성 체크 (너무 높은 점수 차단)
- IP 기반 요청 제한

### 2. 정기적인 업데이트
- 난독화 설정을 주기적으로 변경
- 보안 코드 업데이트

### 3. 중요 로직은 서버로
- 게임의 핵심 로직(점수 계산 등)은 서버에서 처리
- 클라이언트는 UI만 담당

## 📞 지원

문제가 발생하면 개발팀에 문의하세요.

---

**마지막 업데이트**: 2025-01-27

