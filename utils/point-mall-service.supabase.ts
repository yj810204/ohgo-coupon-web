import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { PointMallProduct, PointMallProductInput } from '@/constants/point-mall';
import { sortProductsByOrder, type PointMallOrder, type PurchaseResult } from './point-mall-shared';

const STORAGE_BUCKET = 'photos';

function mapProduct(row: Record<string, unknown>): PointMallProduct {
  const imageUrls = Array.isArray(row.image_urls)
    ? (row.image_urls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : undefined;
  const isBait = row.product_type === 'bait';
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    description: (row.description as string) || '',
    pointPrice: Number(row.point_price) || 0,
    imageUrl: imageUrls?.[0],
    imageUrls,
    stock: row.stock !== undefined ? Number(row.stock) : -1,
    isActive: row.is_active !== false,
    order: Number(row.display_order) || 0,
    createdAt: row.created_at ? new Date(row.created_at as string) : undefined,
    isBaitProduct: isBait,
    baitAmount: isBait ? Math.max(0, Number(row.bait_amount) || 0) : undefined,
  };
}

function inputToRow(input: Partial<PointMallProductInput>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = String(input.name).trim();
  if (input.description !== undefined) row.description = String(input.description).trim();
  if (input.pointPrice !== undefined) row.point_price = Number(input.pointPrice);
  if (input.stock !== undefined) row.stock = Number(input.stock);
  if (input.isActive !== undefined) row.is_active = input.isActive;
  if (input.order !== undefined) row.display_order = Number(input.order) || 0;

  const isBait = input.isBaitProduct === true;
  if (input.isBaitProduct !== undefined) {
    row.product_type = isBait ? 'bait' : 'physical';
  }
  if (input.baitAmount !== undefined) {
    row.bait_amount = Math.max(0, Number(input.baitAmount) || 0);
  }

  if (input.imageUrls !== undefined) {
    const urls = input.imageUrls.map((u) => u.trim()).filter(Boolean);
    row.image_urls = urls.length > 0 ? urls : null;
  } else if (input.imageUrl?.trim()) {
    row.image_urls = [input.imageUrl.trim()];
  }

  return row;
}

export async function getPointMallProductById(id: string): Promise<PointMallProduct | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('point_mall_products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const product = mapProduct(data);
  return product.isActive ? product : null;
}

export async function getPointMallProducts(): Promise<PointMallProduct[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('point_mall_products').select('*');
  if (error) throw error;
  return sortProductsByOrder(
    (data ?? []).map((row: Record<string, unknown>) => mapProduct(row)).filter((p: PointMallProduct) => p.isActive),
  );
}

export async function getAllPointMallProducts(): Promise<PointMallProduct[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from('point_mall_products').select('*');
  if (error) throw error;
  return sortProductsByOrder((data ?? []).map((row: Record<string, unknown>) => mapProduct(row)));
}

export async function addPointMallProduct(input: PointMallProductInput): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const row = inputToRow({
    ...input,
    description: input.description || '',
    stock: input.stock ?? -1,
    isActive: input.isActive !== false,
    order: input.order ?? 0,
    isBaitProduct: input.isBaitProduct === true,
    baitAmount: input.isBaitProduct ? Math.max(1, Number(input.baitAmount) || 1) : 0,
  });
  if (!row.product_type) row.product_type = input.isBaitProduct ? 'bait' : 'physical';

  const { data, error } = await supabase
    .from('point_mall_products')
    .insert(row)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('상품 등록 실패');
  return data.id;
}

export async function updatePointMallProduct(
  id: string,
  input: Partial<PointMallProductInput>,
): Promise<void> {
  const row = inputToRow(input);
  if (Object.keys(row).length === 0) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('point_mall_products').update(row).eq('id', id);
  if (error) throw error;
}

export async function deletePointMallProduct(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('point_mall_products').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadProductImage(file: File): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `point-mall/products/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function mapPurchaseErrorCode(msg: string): PurchaseResult {
  if (msg === 'USER_NOT_FOUND') return { ok: false, code: 'USER_NOT_FOUND' };
  if (msg === 'PRODUCT_NOT_FOUND') return { ok: false, code: 'PRODUCT_NOT_FOUND' };
  if (msg === 'PRODUCT_INACTIVE') return { ok: false, code: 'PRODUCT_INACTIVE' };
  if (msg === 'OUT_OF_STOCK') return { ok: false, code: 'OUT_OF_STOCK' };
  if (msg === 'INSUFFICIENT_POINTS') return { ok: false, code: 'INSUFFICIENT_POINTS' };
  return { ok: false, code: 'UNKNOWN' };
}

export async function purchaseProduct(uuid: string, productId: string): Promise<PurchaseResult> {
  const supabase = getSupabaseBrowserClient();

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('total_point, community_point, bait_coupons')
      .eq('id', uuid)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error('USER_NOT_FOUND');

    const { data: product, error: productError } = await supabase
      .from('point_mall_products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new Error('PRODUCT_NOT_FOUND');
    if (!product.is_active) throw new Error('PRODUCT_INACTIVE');

    const stock = product.stock !== undefined ? Number(product.stock) : -1;
    if (stock === 0) throw new Error('OUT_OF_STOCK');

    const price = Number(product.point_price) || 0;
    const isBaitProduct = product.product_type === 'bait';
    let totalPoint = Number(profile.total_point) || 0;
    let communityPoint = Number(profile.community_point) || 0;
    let baitCoupons = Number(profile.bait_coupons) || 0;

    if (isBaitProduct) {
      const baitAmount = Math.max(1, Number(product.bait_amount) || 0);
      if (communityPoint < price) throw new Error('INSUFFICIENT_POINTS');
      communityPoint -= price;
      baitCoupons += baitAmount;
    } else {
      const available = totalPoint + communityPoint;
      if (available < price) throw new Error('INSUFFICIENT_POINTS');
      let remaining = price;
      const fromGame = Math.min(totalPoint, remaining);
      totalPoint -= fromGame;
      remaining -= fromGame;
      communityPoint -= remaining;
    }

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        total_point: totalPoint,
        community_point: communityPoint,
        bait_coupons: baitCoupons,
      })
      .eq('id', uuid);
    if (profileUpdateError) throw profileUpdateError;

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
    return { ok: true, orderId: order.id, baitGranted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.startsWith('USER_') || msg.startsWith('PRODUCT_') || msg.startsWith('OUT_') || msg.startsWith('INSUFFICIENT')) {
      return mapPurchaseErrorCode(msg);
    }
    console.error('purchaseProduct error:', e);
    return { ok: false, code: 'UNKNOWN' };
  }
}

export async function getMyOrders(uuid: string): Promise<PointMallOrder[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('point_mall_orders')
    .select('*')
    .eq('user_id', uuid)
    .order('purchased_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    productId: row.product_id ?? '',
    productName: row.product_name ?? '',
    pointUsed: row.point_used ?? 0,
    status: row.status as PointMallOrder['status'],
    purchasedAt: row.purchased_at,
  }));
}

export async function getUserBaitCoupons(uuid: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('bait_coupons')
    .eq('id', uuid)
    .maybeSingle();
  if (error) throw error;
  return Math.max(0, Number(data?.bait_coupons) || 0);
}

export async function getUserPointBalance(uuid: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('total_point, community_point')
    .eq('id', uuid)
    .maybeSingle();
  if (error) throw error;
  const gamePoints = Number(data?.total_point) || 0;
  const communityPoints = Number(data?.community_point) || 0;
  return { gamePoints, communityPoints, total: gamePoints + communityPoints };
}
