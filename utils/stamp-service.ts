import { DATA_SOURCE, isFirebaseDataSource } from '@/lib/data-source';
import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import { getUserActionLogs } from './user-action-log-service';
import * as supa from './stamp-service.supabase';
import * as fb from './stamp-service.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

const STAMPS_TTL_MS = 45_000;
const STAMPS_PREFIX = 'stamps:';

function invalidateStamps() {
  invalidateCache(STAMPS_PREFIX);
}

export type CouponItem = supa.CouponItem;

function historyTimeMs(timestamp: unknown): number {
  if (!timestamp) return 0;
  if (typeof timestamp === 'string') {
    const t = new Date(timestamp).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (timestamp instanceof Date) return timestamp.getTime();
  if (
    typeof timestamp === 'object' &&
    timestamp &&
    'toDate' in timestamp &&
    typeof (timestamp as { toDate: () => Date }).toDate === 'function'
  ) {
    return (timestamp as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

function reasonFromLogDetail(detail: string): string | null {
  const match = detail.match(/\(([^)]+)\)\s*$/);
  return match?.[1] ?? null;
}

async function loadStampAdjustLogs(uuid: string) {
  const logs = [...(await getUserActionLogs(uuid))];
  if (isFirebaseDataSource()) {
    const { resolveFirestoreUserId } = await import('@/lib/firebase/resolve-user-id');
    const mapped = await resolveFirestoreUserId(uuid);
    if (mapped && mapped !== uuid) {
      logs.push(...(await getUserActionLogs(mapped)));
    }
  }
  return logs.filter((log) => log.action === '스탬프 적립' || log.action === '스탬프 회수');
}

async function enrichStampHistoryReasons<
  T extends { action?: string; message?: string; timestamp?: unknown },
>(uuid: string, items: T[]): Promise<T[]> {
  const needsReason = items.some(
    (item) =>
      (item.action === 'add' || item.action === 'recall') &&
      typeof item.message === 'string' &&
      item.message.startsWith('ADMIN 방식으로') &&
      !item.message.includes('(')
  );
  if (!needsReason) return items;

  const logs = await loadStampAdjustLogs(uuid);
  if (logs.length === 0) return items;

  return items.map((item) => {
    if (
      (item.action !== 'add' && item.action !== 'recall') ||
      typeof item.message !== 'string' ||
      !item.message.startsWith('ADMIN 방식으로') ||
      item.message.includes('(')
    ) {
      return item;
    }
    const want = item.action === 'add' ? '스탬프 적립' : '스탬프 회수';
    const time = historyTimeMs(item.timestamp);
    let best: { reason: string; dist: number } | null = null;
    for (const log of logs) {
      if (log.action !== want) continue;
      const reason = reasonFromLogDetail(log.detail);
      if (!reason) continue;
      const dist = Math.abs(log.timestamp.getTime() - time);
      if (dist > 180_000) continue;
      if (!best || dist < best.dist) best = { reason, dist };
    }
    if (!best) return item;
    return { ...item, message: `${item.message} (${best.reason})` };
  });
}

export const getStampHistory: typeof supa.getStampHistory = async (opts) => {
  const items = await cachedFetch(
    `${STAMPS_PREFIX}history:${opts.uuid}:${opts.startDate?.getTime() ?? ''}:${opts.endDate?.getTime() ?? ''}`,
    STAMPS_TTL_MS,
    () => impl.getStampHistory(opts)
  );
  return enrichStampHistoryReasons(opts.uuid, items);
};

export const getStamps: typeof supa.getStamps = (uuid) =>
  cachedFetch(`${STAMPS_PREFIX}list:${uuid}`, STAMPS_TTL_MS, () => impl.getStamps(uuid));

export const getCoupons: typeof supa.getCoupons = (uuid) =>
  cachedFetch(`${STAMPS_PREFIX}coupons:${uuid}`, STAMPS_TTL_MS, () => impl.getCoupons(uuid));

export const getCouponCount: typeof supa.getCouponCount = (uuid) =>
  cachedFetch(`${STAMPS_PREFIX}couponCount:${uuid}`, STAMPS_TTL_MS, () => impl.getCouponCount(uuid));

export const clearStampHistory: typeof supa.clearStampHistory = async (...a) => {
  const result = await impl.clearStampHistory(...a);
  invalidateStamps();
  return result;
};

export const issue50PercentCoupon: typeof supa.issue50PercentCoupon = async (...a) => {
  const result = await impl.issue50PercentCoupon(...a);
  invalidateStamps();
  return result;
};

export const addStamp: typeof supa.addStamp = async (...a) => {
  const result = await impl.addStamp(...a);
  invalidateStamps();
  return result;
};

export const addStampBatch: typeof supa.addStampBatch = async (...a) => {
  const result = await impl.addStampBatch(...a);
  invalidateStamps();
  return result;
};

export const removeStampBatch: typeof supa.removeStampBatch = async (...a) => {
  const result = await impl.removeStampBatch(...a);
  invalidateStamps();
  return result;
};

export const issueCoupon: typeof supa.issueCoupon = async (...a) => {
  const result = await impl.issueCoupon(...a);
  invalidateStamps();
  return result;
};

export const clearStamps: typeof supa.clearStamps = async (...a) => {
  const result = await impl.clearStamps(...a);
  invalidateStamps();
  return result;
};

export const revokeCoupon: typeof supa.revokeCoupon = async (...a) => {
  const result = await impl.revokeCoupon(...a);
  invalidateStamps();
  return result;
};

export const deleteUser: typeof supa.deleteUser = async (...a) => {
  const result = await impl.deleteUser(...a);
  invalidateStamps();
  return result;
};

export const useOneCoupon: typeof supa.useOneCoupon = async (...a) => {
  const result = await impl.useOneCoupon(...a);
  invalidateStamps();
  return result;
};

export const useCouponById: typeof supa.useCouponById = async (...a) => {
  const result = await impl.useCouponById(...a);
  invalidateStamps();
  return result;
};

export const deleteStamp: typeof supa.deleteStamp = async (...a) => {
  const result = await impl.deleteStamp(...a);
  invalidateStamps();
  return result;
};

export const attachReasonToRecentStampHistory: typeof supa.attachReasonToRecentStampHistory =
  async (...a) => {
    const result = await impl.attachReasonToRecentStampHistory(...a);
    invalidateStamps();
    return result;
  };

export const addStampBatchWithReason: typeof supa.addStampBatchWithReason = async (...a) => {
  const result = await impl.addStampBatchWithReason(...a);
  invalidateStamps();
  return result;
};

export const removeStampBatchWithReason: typeof supa.removeStampBatchWithReason = async (...a) => {
  const result = await impl.removeStampBatchWithReason(...a);
  invalidateStamps();
  return result;
};

export const adjustCouponsWithReason: typeof supa.adjustCouponsWithReason = async (...a) => {
  const result = await impl.adjustCouponsWithReason(...a);
  invalidateStamps();
  return result;
};
