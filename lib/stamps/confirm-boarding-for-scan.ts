'use client';

import { ohgoConfirm } from '@/lib/ohgo-dialog';
import { getBoardingForm, isBoardingComplete } from '@/utils/boarding-service';

export const STAMP_BOARDING_CONFIRM =
  '스탬프를 적립하려면 승선정보(명부)가 필요합니다. 작성 페이지로 이동할까요?';

export type BoardingScanGate = 'ok' | 'go_form' | 'cancel';

/** QR 진입 전 승선정보 확인. 없으면 작성 페이지로 보낼지 묻는다. */
export async function confirmBoardingForStampScan(userId: string): Promise<BoardingScanGate> {
  try {
    const record = await getBoardingForm(userId);
    if (isBoardingComplete(record)) return 'ok';
  } catch (e) {
    console.warn('승선정보 조회 실패:', e);
  }

  const go = await ohgoConfirm(STAMP_BOARDING_CONFIRM);
  return go ? 'go_form' : 'cancel';
}
