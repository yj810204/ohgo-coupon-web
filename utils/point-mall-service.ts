import { doc, getDoc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import {
  getFirebasePointBalance,
  invalidatePointCache,
  splitPointBalance,
} from '@/lib/firebase/user-points';
import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PointMallOrder, PurchaseResult } from './point-mall-shared';
import * as supa from './point-mall-service.supabase';

export type { PointMallOrder, PurchaseResult };

const MALL_TTL_MS = 2 * 60_000;
const BAIT_TTL_MS = 20_000;
const MALL_PREFIX = 'mall:';
const BAIT_PREFIX = 'bait:';

export function invalidateBaitCache() {
  invalidateCache(BAIT_PREFIX);
}

function invalidateMall() {
  invalidateCache(MALL_PREFIX);
}

export const getPointMallProductById = supa.getPointMallProductById;
export const getPointMallProducts = () =>
  cachedFetch(`${MALL_PREFIX}products`, MALL_TTL_MS, () => supa.getPointMallProducts());
export const getAllPointMallProducts = () =>
  cachedFetch(`${MALL_PREFIX}all`, MALL_TTL_MS, () => supa.getAllPointMallProducts());

export const addPointMallProduct: typeof supa.addPointMallProduct = async (...a) => {
  const result = await supa.addPointMallProduct(...a);
  invalidateMall();
  return result;
};
export const updatePointMallProduct: typeof supa.updatePointMallProduct = async (...a) => {
  const result = await supa.updatePointMallProduct(...a);
  invalidateMall();
  return result;
};
export const deletePointMallProduct: typeof supa.deletePointMallProduct = async (...a) => {
  const result = await supa.deletePointMallProduct(...a);
  invalidateMall();
  return result;
};
export const uploadProductImage = supa.uploadProductImage;
export const getMyOrders = supa.getMyOrders;

async function fetchUserBaitCoupons(uuid: string): Promise<number> {
  if (!isFirebaseDataSource()) return supa.getUserBaitCoupons(uuid);
  const fbUserId = await resolveFirestoreUserId(uuid);
  if (!fbUserId) return 0;
  const snap = await getDoc(doc(getFirebaseDb(), 'users', fbUserId));
  if (!snap.exists()) return 0;
  return Math.max(0, Number(snap.data().baitCoupons) || 0);
}

export async function getUserBaitCoupons(uuid: string): Promise<number> {
  return cachedFetch(`${BAIT_PREFIX}${uuid}`, BAIT_TTL_MS, () => fetchUserBaitCoupons(uuid));
}

export async function getUserPointBalance(uuid: string) {
  if (!isFirebaseDataSource()) return supa.getUserPointBalance(uuid);
  return getFirebasePointBalance(uuid);
}

/** firebase 모드: 잔액은 Firestore, 카탈로그·주문은 Supabase */
export async function purchaseProduct(uuid: string, productId: string): Promise<PurchaseResult> {
  if (!isFirebaseDataSource()) {
    const result = await supa.purchaseProduct(uuid, productId);
    if (result.ok) {
      invalidateBaitCache();
      invalidatePointCache();
    }
    return result;
  }

  const db = getFirebaseDb();
  const supabase = getSupabaseBrowserClient();
  const fbUserId = await resolveFirestoreUserId(uuid);
  if (!fbUserId) return { ok: false, code: 'USER_NOT_FOUND' };

  try {
    await getFirebasePointBalance(uuid);
    const userRef = doc(db, 'users', fbUserId);
    const userSnap = await getDocFromServer(userRef);
    if (!userSnap.exists()) return { ok: false, code: 'USER_NOT_FOUND' };

    const { data: product, error: productError } = await supabase
      .from('point_mall_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return { ok: false, code: 'PRODUCT_NOT_FOUND' };
    if (!product.is_active) return { ok: false, code: 'PRODUCT_INACTIVE' };

    const stock = product.stock !== undefined ? Number(product.stock) : -1;
    if (stock === 0) return { ok: false, code: 'OUT_OF_STOCK' };

    const price = Number(product.point_price) || 0;
    const isBaitProduct = product.product_type === 'bait';
    const data = userSnap.data();
    let totalPoint = Number(data.totalPoint) || 0;
    let baitCoupons = Number(data.baitCoupons) || 0;
    const { communityPoints } = splitPointBalance(totalPoint, Number(data.communityPoint) || 0);

    if (totalPoint < price) return { ok: false, code: 'INSUFFICIENT_POINTS' };

    const fromGame = Math.min(totalPoint - communityPoints, price);
    const fromCommunity = price - fromGame;
    totalPoint -= price;
    const nextCommunity = Math.max(0, communityPoints - fromCommunity);
    if (isBaitProduct) {
      baitCoupons += Math.max(1, Number(product.bait_amount) || 0);
    }

    await updateDoc(userRef, { totalPoint, communityPoint: nextCommunity, baitCoupons });

    if (stock > 0) {
      const { error: stockError } = await supabase
        .from('point_mall_products')
        .update({ stock: stock - 1 })
        .eq('id', productId);
      if (stockError) throw stockError;
    }

    const { data: order, error: orderError } = await supabase
      .from('point_mall_orders')
      .insert({
        user_id: uuid,
        product_id: productId,
        product_name: product.name || '',
        point_used: price,
        status: 'confirmed',
      })
      .select('id')
      .single();
    if (orderError || !order) throw orderError ?? new Error('주문 생성 실패');

    const baitGranted = isBaitProduct ? Math.max(1, Number(product.bait_amount) || 0) : undefined;
    invalidateBaitCache();
    invalidatePointCache();
    return { ok: true, orderId: order.id, baitGranted };
  } catch (e) {
    console.error('purchaseProduct firebase error:', e);
    return { ok: false, code: 'UNKNOWN' };
  }
}
