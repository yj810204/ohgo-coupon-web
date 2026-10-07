# Band 게시글 가져오기 (Mac 로컬, MVP)

운영자가 **직접 운영하는 밴드**의 게시글 하나를 로컬로 가져오는 도구입니다.
제목/본문/이미지/일정 정보를 `out/{postId}/`에 저장합니다. ohgo로 등록(push)하는 기능은 아직 없습니다.

## 주의 (Band 이용약관)

- 로그인된 브라우저를 자동화하는 방식이라 Band 약관에 어긋날 수 있습니다. 본인 밴드만, 필요한 게시글만, 한 번에 하나씩 가져오세요. 반복 수집이나 대량 수집에 쓰지 마세요.
- Band 웹 내부 API와 화면 구조는 공개 규격이 아니어서 예고 없이 바뀔 수 있습니다.
- `user-data/`에는 Band 로그인 쿠키가, `out/`에는 회원이 올린 글과 사진이 들어 있습니다. 둘 다 gitignore 되어 있으니 커밋하거나 공유하지 마세요. Mac 디스크 암호화(FileVault)를 켜 두세요.

## 설치

저장소 루트에서 한 번만 실행합니다. Node 22.6 이상이 필요합니다(`.mts`를 `--experimental-strip-types`로 실행).

```bash
npm install
npx playwright install chromium
```

설치된 Chrome을 쓰고 싶으면 명령 앞에 `BAND_BROWSER_CHANNEL=chrome`을 붙이세요.

## 사용법

### 1. 로그인 (처음 한 번)

```bash
npm run band:login
```

브라우저 창이 열리면 Band에 로그인합니다. 로그인이 확인되면 창이 자동으로 닫히고 세션이 `tools/band-import/user-data/`에 저장됩니다. 이미 로그인되어 있으면 바로 끝납니다. 세션이 만료되면 다시 실행하세요.

Band 로그인 쿠키 일부는 브라우저를 닫으면 사라지는 세션 쿠키입니다. 그래서 login이 끝날 때 Band 쿠키를 `user-data/band-session.json`에 따로 저장하고, fetch가 시작할 때 되살립니다. 이 기능이 생기기 전에 로그인했다면 `npm run band:login`을 한 번 다시 실행하세요. fetch에 `--headed`를 붙일 필요는 없습니다.

### 2. 게시글 가져오기

```bash
npm run band:fetch -- https://band.us/band/88348442/post/2925
```

결과:

```
tools/band-import/out/2925/
  extracted.json   # 추출 결과
  01.jpg 02.jpg …  # 원본 이미지
  api-post.json    # Band API 원본 응답(디버깅용, API로 추출했을 때만)
```

옵션:

| 옵션 | 설명 |
| --- | --- |
| `--headed` | 브라우저 창을 띄워서 진행 (문제 확인용) |
| `--timeout 30` | 게시글 로딩 대기 시간(초) |
| `--out DIR` | 저장 위치 변경 (기본 `tools/band-import/out`) |
| `--dry-run` | 브라우저 없이 URL 해석 결과와 저장 경로만 출력 |

저장된 파일 검사:

```bash
npm run band:validate -- tools/band-import/out/2925/extracted.json
```

## extracted.json

```jsonc
{
  "schemaVersion": 1,
  "source": { "url": "https://band.us/band/88348442/post/2925", "bandId": "88348442", "postId": "2925", "fetchedAt": "2026-10-06T22:00:00.000Z" },
  "extractedVia": "api",          // "api" 또는 "dom"(화면 폴백)
  "author": "작성자 이름",
  "createdAt": "2026-10-06T03:34:25.874Z",
  "title": "본문 첫 줄 (Band 글에는 제목이 없음)",
  "body": "본문 평문",
  "images": [{ "index": 0, "sourceUrl": "https://…pstatic.net/…", "file": "01.jpg", "width": 1080, "height": 1440 }],
  "schedules": [{ "name": "갈치 출조", "description": null, "startAt": "…", "endAt": "…", "isAllDay": false }],
  "scheduleLikeLines": ["출항 05:30 다대포항"],
  "warnings": []
}
```

- `file`이 `null`이면 해당 이미지 다운로드에 실패한 것입니다.
- `schedules`는 Band 일정 첨부가 있을 때만 채워집니다. `scheduleLikeLines`는 본문에서 날짜/시간 패턴이 보이는 줄을 단순히 골라낸 것입니다.

## 동작 방식

1. 저장된 프로필로 Chromium을 열고 게시글 URL로 이동합니다.
2. Band 웹이 부르는 `api*.band.us` JSON 응답 중 `post_no`가 일치하는 게시글 객체를 찾습니다(경로에 의존하지 않고 응답 내용을 검사).
3. API 응답을 못 찾으면 화면(DOM)에서 본문과 사진을 읽습니다. 이 경우 사진이 일부만 잡힐 수 있어 `warnings`에 표시됩니다.
4. 로그인 여부는 Band 웹이 부팅할 때 받는 `auth.band.us` 응답의 로그인 상태 값으로 판단합니다.
5. 이미지는 0.4초 간격으로 하나씩 받습니다.

## 로그인이 자꾸 풀릴 때

- 오류 메시지의 `(로그인 상태: NONE, Band 쿠키 n개)`는 Band 서버가 로그인 안 됨으로 응답했다는 뜻입니다. `npm run band:login`을 다시 실행하고 `세션 저장: Band 쿠키 …개`가 출력되는지 확인하세요.
- login 창을 닫기 전에 fetch를 실행하면 같은 프로필을 동시에 쓸 수 없어 실패합니다. 창이 닫힌 뒤 실행하세요.
- `BAND_USER_DATA_DIR`를 지정했다면 login과 fetch에 같은 값을 써야 합니다. 두 명령 모두 처음에 `브라우저 프로필:` 경로(절대 경로)를 출력하니 같은지 비교해 보세요.
- 그래도 안 되면 `--headed`로 실행해 창에서 로그인 상태를 직접 확인하세요.

## 테스트

Band 계정 없이 돌아갑니다. URL 해석, 정규화, 스키마 검사 단위 테스트와, 가짜 Band 페이지/API를 띄워 fetch 흐름 전체를 확인하는 오프라인 테스트가 있습니다.

```bash
npm run test:band-import
```
