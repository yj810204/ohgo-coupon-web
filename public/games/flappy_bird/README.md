# Flappy Bird 게임

플래피 버드 스타일의 간단한 액션 게임입니다.

## 게임 설명

새를 조종하여 파이프 사이를 통과하는 게임입니다. 화면을 클릭하거나 터치하여 새를 위로 날리세요!

## 빌드 방법

### 개발 모드 (난독화 없이 복사)
디버깅을 위해 `console.log`를 확인할 수 있도록 소스 파일을 그대로 복사합니다.

```bash
npm run dev
```

### 프로덕션 빌드 (난독화)
### Linux/Mac
```bash
./build.sh
```

### Windows
```cmd
build.bat
```

또는 npm으로 직접:
```bash
npm run build
```

## 에셋

게임은 Phaser 3의 도형을 사용하여 그래픽을 생성하므로 추가 이미지 파일이 필요하지 않습니다. 

썸네일 이미지(`assets/thumbnail.png`)는 관리자 페이지에서 업로드할 수 있습니다.

## 게임 설정

`config.json` 파일에서 다음 설정을 변경할 수 있습니다:

- `gravity`: 중력 값 (기본: 800)
- `jump_velocity`: 점프 속도 (기본: -400)
- `pipe_spacing`: 파이프 간격 (기본: 300)
- `pipe_speed`: 파이프 이동 속도 (기본: 120, 초당 픽셀)
- `pipe_gap`: 파이프 사이 간격 (기본: 150)
- `pipe_width`: 파이프 너비 (기본: 60)
- `bird_size`: 새 크기 (기본: 40)

