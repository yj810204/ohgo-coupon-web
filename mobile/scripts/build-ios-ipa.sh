#!/usr/bin/env bash
# 로컬 IPA 빌드: buildNumber +1 → 서명(EAS 인증서 또는 credentials.json) → dist/*.ipa
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/bump-native-version.mjs ios
VERSION="$(node -p "require('./app.json').expo.version")"
CODE="$(node -p "require('./app.json').expo.ios.buildNumber")"
OUT="dist/ohgo-${VERSION}-${CODE}.ipa"
mkdir -p dist

PROFILE="production"
if [[ -f credentials.json ]]; then
  PROFILE="production-local"
  echo "credentials.json 사용 (로컬 인증서)"
else
  echo "EAS 원격 자격 증명 사용 (기존 App Store 인증서)"
fi

npx eas build \
  --platform ios \
  --profile "$PROFILE" \
  --local \
  --non-interactive \
  --output "$OUT"

echo "IPA: $OUT"
echo "version: ${VERSION} (${CODE})"
