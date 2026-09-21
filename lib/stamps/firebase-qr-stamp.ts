/**
 * 신앱이 Firestore `users/{id}/stamps` 에 QR 스탬프를 쓸 때 넣는 필드.
 *
 * 구 Cloud Function `processQrScanOnStampCreation_transitional` 은
 * `processedByServer` 가 없으면 오늘 승선명부에 이미 있는 회원(선장 대리가입·명부 등록)
 * 의 스탬프를 삭제하고 관리자/공용폰에 'QR 중복 처리 알림' 푸시를 보낸다.
 * 신앱 API가 이미 적립·쿨다운·쿠폰을 처리하므로 이 플래그로 CF를 no-op 시킨다.
 */
export function firebaseQrStampWriteFields(input: { date: string; timestamp: Date }) {
  return {
    date: input.date,
    method: 'QR' as const,
    timestamp: input.timestamp,
    processedByServer: true,
  };
}
