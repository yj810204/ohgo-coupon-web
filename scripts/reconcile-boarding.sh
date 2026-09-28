#!/usr/bin/env bash
# 승선명단 ↔ 스탬프 대사. 기본은 보고만 하고 데이터를 바꾸지 않는다.
#
# 호스트 crontab 예시 (컨테이너 안에는 cron 없음):
#   # 출항 확정 30분 뒤 — 1항차 06:00 확정 가정 → 06:30 KST = 21:30 UTC
#   30 21 * * * /path/to/ohgo-coupon-web/scripts/reconcile-boarding.sh
#   # 매일 22:00 KST = 13:00 UTC
#   0 13 * * * /path/to/ohgo-coupon-web/scripts/reconcile-boarding.sh
#
# 환경 변수:
#   RECONCILE_SECRET   필수. 서버 .env.production 과 동일해야 한다.
#   RECONCILE_URL      기본 https://ohgo.codejaka.com/api/admin/reconcile-boarding
#   RECONCILE_DATE     선택 YYYY-MM-DD (기본: 서버 오늘 KST)
#   RECONCILE_TRIP     선택 항차 번호
#   RECONCILE_APPLY    1 이면 적용 모드. 기본은 보고만.

set -euo pipefail

if [ -z "${RECONCILE_SECRET:-}" ]; then
  echo "RECONCILE_SECRET 이 없습니다. 실행하지 않습니다." >&2
  exit 1
fi

URL="${RECONCILE_URL:-https://ohgo.codejaka.com/api/admin/reconcile-boarding}"
BODY='{"apply":false}'
if [ "${RECONCILE_APPLY:-}" = "1" ]; then
  BODY='{"apply":true}'
fi

if [ -n "${RECONCILE_DATE:-}" ] || [ -n "${RECONCILE_TRIP:-}" ]; then
  DATE_JSON="${RECONCILE_DATE:-}"
  TRIP_JSON="${RECONCILE_TRIP:-}"
  BODY=$(python3 - <<PY
import json, os
payload = {"apply": os.environ.get("RECONCILE_APPLY") == "1"}
date = os.environ.get("RECONCILE_DATE")
trip = os.environ.get("RECONCILE_TRIP")
if date:
    payload["date"] = date
if trip:
    payload["tripNumber"] = int(trip)
print(json.dumps(payload))
PY
)
fi

curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-reconcile-secret: $RECONCILE_SECRET" \
  -d "$BODY"
echo
