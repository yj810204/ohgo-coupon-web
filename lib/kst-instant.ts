import { getTodayDate } from '@/lib/kst-date';

/** Firestore Timestamp / Date / ISO 문자열을 Date 로. */
export function toJsDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const rec = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof rec.toDate === 'function') {
      const parsed = rec.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
    const seconds = rec.seconds ?? rec._seconds;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000);
    }
  }
  return null;
}

/** 스탬프의 영업일(KST). timestamp 가 있으면 그걸 쓰고, 없으면 date 필드를 쓴다. */
export function stampBusinessDate(stamp: { date?: unknown; timestamp?: unknown }): string | null {
  const fromTs = toJsDate(stamp.timestamp);
  if (fromTs) return getTodayDate(fromTs);
  if (typeof stamp.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stamp.date)) {
    return stamp.date;
  }
  return null;
}
