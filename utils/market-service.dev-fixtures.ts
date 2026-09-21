import { DEV_MOCK_USER, isDevAuthBypass } from '@/lib/dev-auth';
import type { MarketListing, MarketStatus } from './market-service.shared';

const STORAGE_KEY = 'ohgo-dev-market-listings';
const now = '2026-09-20T00:00:00.000Z';

function listing(
  id: string,
  status: MarketStatus,
  title: string,
  extras: Partial<MarketListing> = {}
): MarketListing {
  return {
    id,
    sellerId: DEV_MOCK_USER.uuid,
    sellerName: DEV_MOCK_USER.name,
    title,
    description: `${title} 개발용 픽스처`,
    category: 'etc',
    price: 35000,
    conditionGrade: 'mid',
    imageUrls: [],
    contactPhone: '010-0000-0000',
    tradeArea: 'meetup:속초',
    status,
    inspectedInPerson: false,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    ...extras,
  };
}

function seed(): MarketListing[] {
  return [
    listing('dev-market-pending', 'pending', '심사 대기 릴'),
    listing('dev-market-approved', 'approved', '판매중 낚싯대'),
    listing('dev-market-hidden', 'hidden', '강제숨김 쿨러'),
    listing('dev-market-sold', 'sold', '판매완료 의자', { soldAt: now }),
  ];
}

function read(): MarketListing[] {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as MarketListing[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* ignore broken session data */
  }
  return seed();
}

function write(next: MarketListing[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function isMarketDevFixtureMode(): boolean {
  return isDevAuthBypass();
}

export function getDevMarketFixtures(status?: MarketStatus): MarketListing[] {
  return read().filter((item) => (status ? item.status === status : true));
}

export function getDevMarketListing(id: string): MarketListing | null {
  return read().find((item) => item.id === id) ?? null;
}

export function deleteDevMarketListing(id: string): void {
  const current = read();
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) {
    throw new Error('판매글을 찾을 수 없습니다.');
  }
  write(next);
}

export function hideDevMarketListing(id: string): void {
  const current = getDevMarketListing(id);
  if (!current) throw new Error('판매글을 찾을 수 없습니다.');
  write(read().map((item) => (item.id === id ? { ...item, status: 'hidden' as const } : item)));
}

export function unhideDevMarketListing(id: string): void {
  const current = getDevMarketListing(id);
  if (!current) throw new Error('판매글을 찾을 수 없습니다.');
  if (current.status !== 'hidden') throw new Error('강제숨김 상태가 아닙니다.');
  write(read().map((item) => (item.id === id ? { ...item, status: 'approved' as const } : item)));
}

export function markDevMarketListingSold(id: string): void {
  const current = getDevMarketListing(id);
  if (!current || current.status !== 'approved') {
    throw new Error('판매완료로 처리할 수 없습니다.');
  }
  write(
    read().map((item) =>
      item.id === id ? { ...item, status: 'sold' as const, soldAt: new Date().toISOString() } : item
    )
  );
}
