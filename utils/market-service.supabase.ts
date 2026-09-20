import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { notifyAllAdmins, sendPushToUser } from '@/utils/send-push';
import {
  type MarketCategory,
  type MarketConditionGrade,
  type MarketListing,
  type MarketListingInput,
  type MarketStatus,
} from './market-service.shared';

const LIST_COLUMNS =
  'id, seller_id, seller_name, title, description, category, price, condition_grade, image_urls, trade_area, status, admin_condition_grade, admin_note, inspected_in_person, reject_reason, reviewed_by, reviewed_at, view_count, sold_at, created_at, updated_at';

function parseGrade(value: unknown): MarketConditionGrade | undefined {
  if (value === 'high' || value === 'mid' || value === 'low') return value;
  return undefined;
}

function parseCategory(value: unknown): MarketCategory {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'etc';
}

function parseStatus(value: unknown): MarketStatus {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'sold' ||
    value === 'hidden'
  ) {
    return value;
  }
  return 'pending';
}

function parseImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parseImageUrls(parsed);
    } catch {
      return [value.trim()];
    }
  }
  return [];
}

function mapListing(row: Record<string, unknown>, includeContact = false): MarketListing {
  return {
    id: row.id as string,
    sellerId: (row.seller_id as string) ?? '',
    sellerName: (row.seller_name as string) ?? '',
    title: (row.title as string) ?? '',
    description: (row.description as string) ?? '',
    category: parseCategory(row.category),
    price: Number(row.price) || 0,
    conditionGrade: parseGrade(row.condition_grade),
    imageUrls: parseImageUrls(row.image_urls),
    contactPhone: includeContact ? ((row.contact_phone as string) ?? undefined) : undefined,
    tradeArea: (row.trade_area as string) ?? undefined,
    status: parseStatus(row.status),
    adminConditionGrade: parseGrade(row.admin_condition_grade),
    adminNote: (row.admin_note as string) ?? undefined,
    inspectedInPerson: row.inspected_in_person === true,
    rejectReason: (row.reject_reason as string) ?? undefined,
    reviewedBy: (row.reviewed_by as string) ?? undefined,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    viewCount: Number(row.view_count) || 0,
    soldAt: (row.sold_at as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

async function uploadImageFiles(files: File[], userId: string): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const form = new FormData();
    form.append('file', files[i]);
    form.append('kind', 'market');
    form.append('prefix', `${userId}_${i}`);
    const res = await fetch('/api/community/upload-photo', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    let json: { success?: boolean; message?: string; imageUrl?: string } = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    if (!res.ok || !json.success || !json.imageUrl) {
      throw new Error(json.message || '이미지 업로드에 실패했습니다.');
    }
    urls.push(json.imageUrl);
  }
  return urls;
}

export async function getApprovedListings(category?: MarketCategory): Promise<MarketListing[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from('market_listings')
    .select(LIST_COLUMNS)
    .in('status', ['approved', 'sold'])
    .order('created_at', { ascending: false });
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapListing(row));
}

export async function getListing(id: string): Promise<MarketListing | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('market_listings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapListing(data as Record<string, unknown>, true) : null;
}

export async function getMyListings(userId: string): Promise<MarketListing[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('market_listings')
    .select(LIST_COLUMNS)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapListing(row));
}

export async function createListing(
  sellerId: string,
  sellerName: string,
  input: MarketListingInput,
  imageFiles?: File[]
): Promise<string> {
  const uploaded = imageFiles && imageFiles.length > 0 ? await uploadImageFiles(imageFiles, sellerId) : [];
  const imageUrls = [...(input.imageUrls ?? []), ...uploaded];
  if (imageUrls.length === 0) throw new Error('이미지를 1장 이상 등록해주세요.');

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('market_listings')
    .insert({
      seller_id: sellerId,
      seller_name: sellerName,
      title: input.title,
      description: input.description,
      category: input.category,
      price: input.price,
      condition_grade: input.conditionGrade ?? null,
      image_urls: imageUrls,
      contact_phone: input.contactPhone ?? null,
      trade_area: input.tradeArea ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('판매글 등록에 실패했습니다.');

  void notifyAllAdmins(
    `${sellerName}님이 중고장터 상품을 등록했습니다. 검수가 필요합니다.`,
    '중고장터 심사 요청',
    'admin-market'
  );
  return data.id;
}

export async function updateMyListing(
  id: string,
  input: Partial<MarketListingInput>,
  imageFiles?: File[],
  sellerId?: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const current = await getListing(id);
  if (!current) throw new Error('판매글을 찾을 수 없습니다.');
  if (current.status === 'sold' || current.status === 'hidden') {
    throw new Error('수정할 수 없는 상태입니다.');
  }

  const uploaded =
    imageFiles && imageFiles.length > 0
      ? await uploadImageFiles(imageFiles, sellerId || current.sellerId)
      : [];
  const imageUrls = [...(input.imageUrls ?? current.imageUrls), ...uploaded];

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.price !== undefined) updateData.price = input.price;
  if (input.conditionGrade !== undefined) updateData.condition_grade = input.conditionGrade;
  if (input.contactPhone !== undefined) updateData.contact_phone = input.contactPhone;
  if (input.tradeArea !== undefined) updateData.trade_area = input.tradeArea;
  if (imageUrls.length > 0) updateData.image_urls = imageUrls;
  if (current.status === 'rejected' || current.status === 'approved') {
    updateData.status = 'pending';
  }

  const { error } = await supabase.from('market_listings').update(updateData).eq('id', id);
  if (error) throw error;

  if (current.status === 'rejected' || current.status === 'approved') {
    void notifyAllAdmins(
      current.status === 'rejected'
        ? `${current.sellerName}님이 반려된 판매글을 다시 제출했습니다.`
        : `${current.sellerName}님이 판매글을 수정했습니다. 재검수가 필요합니다.`,
      '중고장터 재심사 요청',
      'admin-market'
    );
  }
}

export async function markAsSold(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('market_listings')
    .update({
      status: 'sold',
      sold_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'approved');
  if (error) throw error;
}

export async function deleteMyListing(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('market_listings').delete().eq('id', id);
  if (error) throw error;
}

export async function incrementViewCount(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc('increment_market_view_count', { listing_id: id });
}

export async function getListingsForAdmin(status?: MarketStatus): Promise<MarketListing[]> {
  const supabase = getSupabaseBrowserClient();
  let q = supabase
    .from('market_listings')
    .select('*')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => mapListing(row, true));
}

export async function approveListing(
  id: string,
  reviewerId: string,
  review: {
    grade?: MarketConditionGrade;
    note?: string;
    inspectedInPerson: boolean;
  }
): Promise<void> {
  const listing = await getListing(id);
  if (!listing) throw new Error('판매글을 찾을 수 없습니다.');

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('market_listings')
    .update({
      status: 'approved',
      admin_condition_grade: review.grade ?? null,
      admin_note: review.note ?? null,
      inspected_in_person: review.inspectedInPerson,
      reject_reason: null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;

  if (listing.sellerId) {
    void sendPushToUser({
      uuid: listing.sellerId,
      title: '중고장터 승인',
      body: `'${listing.title}' 판매글이 승인되어 게시되었습니다.`,
      data: { screen: 'market-my' },
    });
  }
}

export async function rejectListing(id: string, reviewerId: string, reason: string): Promise<void> {
  const listing = await getListing(id);
  if (!listing) throw new Error('판매글을 찾을 수 없습니다.');
  if (!reason.trim()) throw new Error('반려 사유를 입력해주세요.');

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('market_listings')
    .update({
      status: 'rejected',
      reject_reason: reason.trim(),
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;

  if (listing.sellerId) {
    const reasonText = reason.trim();
    void sendPushToUser({
      uuid: listing.sellerId,
      title: '중고장터 반려',
      body: reasonText
        ? `'${listing.title}' 판매글이 반려되었습니다. ${reasonText}`
        : `'${listing.title}' 판매글이 반려되었습니다. 사유를 확인하고 수정해 주세요.`,
      data: { screen: 'market-my' },
    });
  }
}

export async function hideListing(id: string, reviewerId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from('market_listings')
    .update({
      status: 'hidden',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}
