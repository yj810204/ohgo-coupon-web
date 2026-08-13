import { DATA_SOURCE } from '@/lib/data-source';
import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import * as supa from './stamp-service.supabase';
import * as fb from './stamp-service.firebase';

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

const STAMPS_TTL_MS = 45_000;
const STAMPS_PREFIX = 'stamps:';

function invalidateStamps() {
  invalidateCache(STAMPS_PREFIX);
}

export type CouponItem = supa.CouponItem;

export const getStampHistory: typeof supa.getStampHistory = (opts) =>
  cachedFetch(
    `${STAMPS_PREFIX}history:${opts.uuid}:${opts.startDate?.getTime() ?? ''}:${opts.endDate?.getTime() ?? ''}`,
    STAMPS_TTL_MS,
    () => impl.getStampHistory(opts)
  );

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
