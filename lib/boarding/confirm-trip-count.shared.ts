import { couponAwardedField, isTruthyFlag, tripCreditedField } from '@/lib/firebase/merged-to';

export type ConfirmTripAction = 'skip' | 'mark-only' | 'increment';

/**
 * 출항 확정 1회당 승선 횟수 +1.
 * 구 QR이 `couponAwardedFor_` 와 함께 이미 올렸으면 마커만 남기고 숫자는 그대로 둔다.
 */
export function planConfirmedTripCredit(input: {
  userData: Record<string, unknown> | null | undefined;
  date: string;
  tripNumber: number;
  todayStampIds: string[];
  legacyAlreadyCounted?: boolean;
}): { action: ConfirmTripAction; marker: string } {
  const marker = tripCreditedField(input.date, input.tripNumber);
  if (!input.userData) return { action: 'skip', marker };
  if (isTruthyFlag(input.userData[marker])) return { action: 'skip', marker };

  const legacy =
    input.legacyAlreadyCounted === true ||
    input.todayStampIds.some((stampId) => isTruthyFlag(input.userData?.[couponAwardedField(stampId)]));
  if (legacy) return { action: 'mark-only', marker };
  return { action: 'increment', marker };
}
