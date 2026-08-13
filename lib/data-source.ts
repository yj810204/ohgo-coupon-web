/**
 * 전환기 데이터 소스 스위치.
 * - firebase: 구앱과 공용 Firestore (미끼 baitCoupons 포함). 구앱 병행 기간의 운영 값.
 * - supabase: 전원 신앱 이후 컷오버.
 */
export type DataSource = 'supabase' | 'firebase';

const raw = (process.env.NEXT_PUBLIC_DATA_SOURCE || 'firebase').toLowerCase().trim();

export const DATA_SOURCE: DataSource = raw === 'firebase' ? 'firebase' : 'supabase';

export function isFirebaseDataSource(): boolean {
  return DATA_SOURCE === 'firebase';
}

export function isSupabaseDataSource(): boolean {
  return DATA_SOURCE === 'supabase';
}
