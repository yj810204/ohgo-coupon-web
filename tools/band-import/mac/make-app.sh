#!/bin/bash
# "Band 가져오기.app" 을 만든다. 앱은 이 저장소의 `npm run band:gui` 를 실행하는 얇은 껍데기다.
# 사용: bash tools/band-import/mac/make-app.sh [출력 폴더(기본 tools/band-import/dist)]
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$TOOL_DIR/../.." && pwd)"
OUT_DIR="${1:-$TOOL_DIR/dist}"
APP="$OUT_DIR/Band 가져오기.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Band 가져오기</string>
  <key>CFBundleDisplayName</key><string>Band 가져오기</string>
  <key>CFBundleIdentifier</key><string>com.ohgo.band-import</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>band-import</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# Finder에서 실행한 앱은 터미널 PATH(nvm, Homebrew)를 모르므로 로그인 셸로 실행한다
cat > "$APP/Contents/MacOS/band-import" <<LAUNCHER
#!/bin/bash
LOG="\$HOME/Library/Logs/band-import-gui.log"
cd "$REPO_DIR" || exit 1
/bin/zsh -lc 'command -v npm >/dev/null' || {
  osascript -e 'display alert "Band 가져오기" message "npm을 찾지 못했습니다. Node.js를 설치한 뒤 다시 실행하세요."'
  exit 1
}
exec /bin/zsh -lc 'npm run -s band:gui' >>"\$LOG" 2>&1
LAUNCHER
chmod +x "$APP/Contents/MacOS/band-import"

# 아이콘: 커밋된 .icns를 그대로 쓴다. 16, 32px은 단순화한 그림이 따로 들어 있어서
# 1024 PNG를 줄여 다시 만들면 안 된다. 다시 만들 때는 `npm run band:icon`을 쓴다.
ICON_SRC="$TOOL_DIR/mac/AppIcon.icns"
if [ ! -f "$ICON_SRC" ]; then
  echo "아이콘 파일이 없습니다: $ICON_SRC (npm run band:icon 으로 만드세요)" >&2
  exit 1
fi
cp "$ICON_SRC" "$APP/Contents/Resources/AppIcon.icns"

# Finder가 예전 아이콘을 계속 보여 주지 않도록 번들 수정 시각을 갱신한다
touch "$APP"

echo "만들었습니다: $APP"
echo "Finder에서 Applications 폴더로 옮겨 쓰면 됩니다. (저장소 위치: $REPO_DIR)"
