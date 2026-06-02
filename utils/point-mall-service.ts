import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import type { PointMallProduct, PointMallProductInput } from '@/constants/point-mall';

const COL = 'pointMallProducts';

export type PointMallOrder = {
  id: string;
  productId: string;
  productName: string;
  pointUsed: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  purchasedAt: Timestamp | Date;
};

function mapProductDoc(id: string, data: Record<string, unknown>): PointMallProduct {
  return {
    id,
    name: (data.name as string) || '',
    description: (data.description as string) || '',
    pointPrice: Number(data.pointPrice) || 0,
    imageUrl: data.imageUrl as string | undefined,
    imageUrls: Array.isArray(data.imageUrls)
      ? (data.imageUrls as string[]).filter(u => typeof u === 'string' && u.trim())
      : undefined,
    stock: data.stock !== undefined ? Number(data.stock) : -1,
    isActive: data.isActive !== false,
    order: Number(data.order) || 0,
    createdAt: data.createdAt as Timestamp | Date | undefined,
    isBaitProduct: data.isBaitProduct === true,
    baitAmount: data.isBaitProduct === true ? Math.max(0, Number(data.baitAmount) || 0) : undefined,
  };
}

function sortByOrder(products: PointMallProduct[]): PointMallProduct[] {
  return [...products].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Firestore는 undefined 필드를 허용하지 않음 — imageUrl은 URL이 있을 때만 포함 */
function buildProductWriteData(
  input: Partial<PointMallProductInput>,
  options?: { includeCreatedAt?: boolean; isUpdate?: boolean }
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (input.name !== undefined) data.name = String(input.name).trim();
  if (input.description !== undefined) data.description = String(input.description).trim();
  if (input.pointPrice !== undefined) data.pointPrice = Number(input.pointPrice);
  if (input.stock !== undefined) data.stock = Number(input.stock);
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.order !== undefined) data.order = Number(input.order) || 0;
  if (input.isBaitProduct !== undefined) data.isBaitProduct = !!input.isBaitProduct;
  if (input.baitAmount !== undefined) data.baitAmount = Math.max(0, Number(input.baitAmount) || 0);

  if (input.imageUrls !== undefined) {
    const urls = input.imageUrls.map(u => u.trim()).filter(Boolean);
    if (urls.length > 0) {
      data.imageUrl = urls[0];
      data.imageUrls = urls;
    } else if (options?.isUpdate) {
      // deleteField()는 문서 수정(update)에서만 사용 가능
      data.imageUrl = deleteField();
      data.imageUrls = deleteField();
    }
  } else {
    const imageUrl = input.imageUrl?.trim();
    if (imageUrl) {
      data.imageUrl = imageUrl;
    }
  }

  if (options?.includeCreatedAt) {
    data.createdAt = Timestamp.now();
  }

  return data;
}

/** 상품 단건 조회 (회원용, 활성 상품만) */
export async function getPointMallProductById(id: string): Promise<PointMallProduct | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  const product = mapProductDoc(snap.id, snap.data());
  if (!product.isActive) return null;
  return product;
}

/** 활성 상품 목록 (회원용) */
export async function getPointMallProducts(): Promise<PointMallProduct[]> {
  const snap = await getDocs(collection(db, COL));
  const products = snap.docs
    .map(d => mapProductDoc(d.id, d.data()))
    .filter(p => p.isActive);
  return sortByOrder(products);
}

/** 전체 상품 목록 (관리자용) */
export async function getAllPointMallProducts(): Promise<PointMallProduct[]> {
  const snap = await getDocs(collection(db, COL));
  return sortByOrder(snap.docs.map(d => mapProductDoc(d.id, d.data())));
}

/** 상품 등록 */
export async function addPointMallProduct(input: PointMallProductInput): Promise<string> {
  const data = buildProductWriteData(
    {
      ...input,
      name: input.name,
      description: input.description || '',
      pointPrice: input.pointPrice,
      stock: input.stock ?? -1,
      isActive: input.isActive !== false,
      order: input.order ?? 0,
      imageUrls: input.imageUrls,
      imageUrl: input.imageUrl,
      isBaitProduct: input.isBaitProduct === true,
      baitAmount: input.isBaitProduct ? Math.max(1, Number(input.baitAmount) || 1) : 0,
    },
    { includeCreatedAt: true }
  );
  const ref = await addDoc(collection(db, COL), data);
  return ref.id;
}

/** 상품 수정 */
export async function updatePointMallProduct(
  id: string,
  input: Partial<PointMallProductInput>
): Promise<void> {
  const data = buildProductWriteData(input, { isUpdate: true });
  if (Object.keys(data).length === 0) return;
  await updateDoc(doc(db, COL, id), data);
}

/** 상품 삭제 */
export async function deletePointMallProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

/** 상품 이미지 업로드 */
export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const imagePath = `point-mall/products/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const storageRef = ref(storage, imagePath);
  const bytes = await file.arrayBuffer();
  const blob = new Blob([bytes], { type: file.type || 'image/jpeg' });
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

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

/** 포인트 차감 + 주문 생성 (일반: 게임 포인트 우선, 미끼: 커뮤니티 포인트만) */
export async function purchaseProduct(uuid: string, productId: string): Promise<PurchaseResult> {
  const userRef = doc(db, 'users', uuid);
  const productRef = doc(db, COL, productId);

  try {
    const result = await runTransaction(db, async transaction => {
      const userSnap = await transaction.get(userRef);
      const productSnap = await transaction.get(productRef);

      if (!userSnap.exists()) throw new Error('USER_NOT_FOUND');
      if (!productSnap.exists()) throw new Error('PRODUCT_NOT_FOUND');

      const productData = productSnap.data();
      if (!productData?.isActive) throw new Error('PRODUCT_INACTIVE');

      const stock = productData.stock !== undefined ? Number(productData.stock) : -1;
      if (stock === 0) throw new Error('OUT_OF_STOCK');

      const price = Number(productData.pointPrice) || 0;
      const isBaitProduct = productData.isBaitProduct === true;
      let totalPoint = Number(userSnap.data()?.totalPoint) || 0;
      let communityPoint = Number(userSnap.data()?.communityPoint) || 0;
      let baitCoupons = Number(userSnap.data()?.baitCoupons) || 0;

      if (isBaitProduct) {
        const baitAmount = Math.max(1, Number(productData.baitAmount) || 0);
        if (communityPoint < price) throw new Error('INSUFFICIENT_POINTS');
        communityPoint -= price;
        baitCoupons += baitAmount;
        transaction.update(userRef, { communityPoint, baitCoupons });
      } else {
        const available = totalPoint + communityPoint;
        if (available < price) throw new Error('INSUFFICIENT_POINTS');

        let remaining = price;
        const fromGame = Math.min(totalPoint, remaining);
        totalPoint -= fromGame;
        remaining -= fromGame;
        communityPoint -= remaining;

        transaction.update(userRef, { totalPoint, communityPoint });
      }

      if (stock > 0) {
        transaction.update(productRef, { stock: stock - 1 });
      }

      const orderRef = doc(collection(db, `users/${uuid}/pointMallOrders`));
      transaction.set(orderRef, {
        productId,
        productName: productData.name || '',
        pointUsed: price,
        status: 'confirmed',
        purchasedAt: Timestamp.now(),
      });

      const baitGranted = isBaitProduct
        ? Math.max(1, Number(productData.baitAmount) || 0)
        : undefined;

      return { orderId: orderRef.id, baitGranted };
    });

    return {
      ok: true,
      orderId: result.orderId,
      baitGranted: result.baitGranted,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'USER_NOT_FOUND') return { ok: false, code: 'USER_NOT_FOUND' };
    if (msg === 'PRODUCT_NOT_FOUND') return { ok: false, code: 'PRODUCT_NOT_FOUND' };
    if (msg === 'PRODUCT_INACTIVE') return { ok: false, code: 'PRODUCT_INACTIVE' };
    if (msg === 'OUT_OF_STOCK') return { ok: false, code: 'OUT_OF_STOCK' };
    if (msg === 'INSUFFICIENT_POINTS') return { ok: false, code: 'INSUFFICIENT_POINTS' };
    if (msg === 'INVALID_BAIT_PRODUCT') return { ok: false, code: 'INVALID_BAIT_PRODUCT' };
    console.error('purchaseProduct error:', e);
    return { ok: false, code: 'UNKNOWN' };
  }
}

/** 내 구매 내역 */
export async function getMyOrders(uuid: string): Promise<PointMallOrder[]> {
  const q = query(collection(db, `users/${uuid}/pointMallOrders`));
  const snap = await getDocs(q);
  const orders = snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
  })) as PointMallOrder[];

  return orders.sort((a, b) => {
    const ta = a.purchasedAt instanceof Timestamp ? a.purchasedAt.toMillis() : new Date(a.purchasedAt).getTime();
    const tb = b.purchasedAt instanceof Timestamp ? b.purchasedAt.toMillis() : new Date(b.purchasedAt).getTime();
    return tb - ta;
  });
}

/** 회원 미끼(교환권) 보유 수 */
export async function getUserBaitCoupons(uuid: string): Promise<number> {
  const userSnap = await getDoc(doc(db, 'users', uuid));
  return userSnap.exists() ? Math.max(0, Number(userSnap.data()?.baitCoupons) || 0) : 0;
}

/** 회원 포인트 잔액 조회 */
export async function getUserPointBalance(uuid: string): Promise<{
  gamePoints: number;
  communityPoints: number;
  total: number;
}> {
  const userSnap = await getDoc(doc(db, 'users', uuid));
  const gamePoints = userSnap.exists() ? Number(userSnap.data()?.totalPoint) || 0 : 0;
  const communityPoints = userSnap.exists() ? Number(userSnap.data()?.communityPoint) || 0 : 0;
  return {
    gamePoints,
    communityPoints,
    total: gamePoints + communityPoints,
  };
}
