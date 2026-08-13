#!/usr/bin/env bash
# 로컬 AAB 빌드: versionCode +1 → 서명(EAS 키 또는 credentials.json) → dist/*.aab
# 실패 후 재시도: bash scripts/build-android-aab.sh --no-bump
set -euo pipefail
cd "$(dirname "$0")/.."

resolve_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    return
  fi
  local candidates=(
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
    "/opt/homebrew/opt/openjdk@17"
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  )
  local home
  for home in "${candidates[@]}"; do
    if [[ -x "${home}/bin/java" ]]; then
      export JAVA_HOME="$home"
      return
    fi
  done
  echo "JDK를 찾지 못했습니다. Android Studio 또는 brew install openjdk@17 이 필요합니다." >&2
  exit 1
}

resolve_java_home
export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="${JAVA_HOME}/bin:${ANDROID_HOME}/platform-tools:${PATH}"

echo "JAVA_HOME=${JAVA_HOME}"
"${JAVA_HOME}/bin/java" -version

BUMP=1
if [[ "${1:-}" == "--no-bump" ]]; then
  BUMP=0
fi

if [[ "$BUMP" -eq 1 ]]; then
  node scripts/bump-native-version.mjs android
fi

VERSION="$(node -p "require('./app.json').expo.version")"
CODE="$(node -p "require('./app.json').expo.android.versionCode")"
OUT="dist/ohgo-${VERSION}-${CODE}.aab"
mkdir -p dist

PROFILE="production"
if [[ -f credentials.json ]]; then
  PROFILE="production-local"
  echo "credentials.json 사용 (로컬 키스토어)"
else
  echo "EAS 원격 자격 증명 사용 (기존 Play 업로드 키)"
fi

npx eas build \
  --platform android \
  --profile "$PROFILE" \
  --local \
  --non-interactive \
  --output "$OUT"

echo "AAB: $OUT"
echo "version: ${VERSION} (${CODE})"
