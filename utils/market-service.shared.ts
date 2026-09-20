import { categoryLabel, DEFAULT_MARKET_CATEGORIES } from './board-category-service';

export type MarketStatus = 'pending' | 'approved' | 'rejected' | 'sold' | 'hidden';
export type MarketCategory = string;
export type MarketConditionGrade = 'high' | 'mid' | 'low';
export type MarketTradeMethod = 'meetup' | 'delivery' | 'ohgo_keep';

export interface MarketListing {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  category: MarketCategory;
  price: number;
  conditionGrade?: MarketConditionGrade;
  imageUrls: string[];
  contactPhone?: string;
  tradeArea?: string;
  status: MarketStatus;
  adminConditionGrade?: MarketConditionGrade;
  adminNote?: string;
  inspectedInPerson: boolean;
  rejectReason?: string;
  reviewedBy?: string;
  reviewedAt?: Date | string;
  viewCount: number;
  soldAt?: Date | string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface MarketListingInput {
  title: string;
  description: string;
  category: MarketCategory;
  price: number;
  conditionGrade?: MarketConditionGrade;
  imageUrls: string[];
  contactPhone?: string;
  tradeArea?: string;
}

export const MARKET_CATEGORIES: { id: MarketCategory; label: string }[] =
  DEFAULT_MARKET_CATEGORIES.map(({ id, label }) => ({ id, label }));

export const MARKET_GRADES: { id: MarketConditionGrade; label: string }[] = [
  { id: 'high', label: '상' },
  { id: 'mid', label: '중' },
  { id: 'low', label: '하' },
];

export const MARKET_TRADE_METHODS: { id: MarketTradeMethod; label: string }[] = [
  { id: 'meetup', label: '직거래' },
  { id: 'delivery', label: '택배거래' },
  { id: 'ohgo_keep', label: '오고피씽보관' },
];

export const MARKET_STATUS_LABELS: Record<MarketStatus, string> = {
  pending: '심사 대기',
  approved: '판매중',
  rejected: '반려',
  sold: '판매완료',
  hidden: '숨김',
};

export function marketCategoryLabel(category: string): string {
  return categoryLabel('market', category) || '기타';
}

export function marketGradeLabel(grade?: string | null): string {
  if (!grade) return '';
  return MARKET_GRADES.find((g) => g.id === grade)?.label ?? '';
}

export function decodeTradeInfo(value?: string | null): {
  method: MarketTradeMethod;
  area: string;
} {
  const raw = (value ?? '').trim();
  if (raw === 'delivery' || raw === 'ohgo_keep') return { method: raw, area: '' };
  if (raw === 'meetup') return { method: 'meetup', area: '' };
  if (raw.startsWith('meetup:')) return { method: 'meetup', area: raw.slice(7).trim() };
  if (raw) return { method: 'meetup', area: raw };
  return { method: 'meetup', area: '' };
}

export function encodeTradeInfo(method: MarketTradeMethod, area?: string): string {
  if (method !== 'meetup') return method;
  const nextArea = (area ?? '').trim();
  return nextArea ? `meetup:${nextArea}` : 'meetup';
}

export function parseTradeMethod(value?: string | null): MarketTradeMethod {
  return decodeTradeInfo(value).method;
}

export function marketTradeMethodLabel(value?: string | null): string {
  const { method, area } = decodeTradeInfo(value);
  const label = MARKET_TRADE_METHODS.find((item) => item.id === method)?.label ?? '';
  if (method === 'meetup' && area) return `${label} | ${area}`;
  return label;
}

export function formatMarketPrice(price: number): string {
  if (!price || price <= 0) return '나눔 · 가격제안';
  return `${price.toLocaleString('ko-KR')}원`;
}

/** 목록용 등록일: 26. 09. 01 */
export function formatMarketCreatedAt(date: Date | string | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(String(date));
  if (Number.isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}. ${mm}. ${dd}`;
}
