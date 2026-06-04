import type { PointMallProduct } from '@/constants/point-mall';

export type PointMallOrder = {
  id: string;
  productId: string;
  productName: string;
  pointUsed: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  purchasedAt: Date | string;
};

export type PurchaseResult =
  | { ok: true; orderId: string; baitGranted?: number }
  | {
      ok: false;
      code:
        | 'USER_NOT_FOUND'
        | 'PRODUCT_NOT_FOUND'
        | 'PRODUCT_INACTIVE'
        | 'OUT_OF_STOCK'
        | 'INSUFFICIENT_POINTS'
        | 'COMMUNITY_POINT_ONLY'
        | 'INVALID_BAIT_PRODUCT'
        | 'UNKNOWN';
    };

export function sortProductsByOrder(products: PointMallProduct[]): PointMallProduct[] {
  return [...products].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
