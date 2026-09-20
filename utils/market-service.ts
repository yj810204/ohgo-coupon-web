import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import type {
  MarketCategory,
  MarketListing,
  MarketListingInput,
  MarketStatus,
} from './market-service.shared';
import * as fixtures from './market-service.dev-fixtures';
import * as supa from './market-service.supabase';

export type {
  MarketCategory,
  MarketConditionGrade,
  MarketListing,
  MarketListingInput,
  MarketStatus,
  MarketTradeMethod,
} from './market-service.shared';
export {
  MARKET_CATEGORIES,
  MARKET_GRADES,
  MARKET_STATUS_LABELS,
  MARKET_TRADE_METHODS,
  canSellerDeleteListing,
  canSellerEditListing,
  formatMarketCreatedAt,
  formatMarketPrice,
  isForceHiddenListing,
  marketCategoryLabel,
  marketGradeLabel,
  marketStatusStyle,
  marketTradeMethodLabel,
  parseTradeMethod,
  decodeTradeInfo,
  encodeTradeInfo,
} from './market-service.shared';

const MARKET_PREFIX = 'market:';
const MARKET_TTL_MS = 30_000;

function bustMarketCache() {
  invalidateCache(MARKET_PREFIX);
}

export function getApprovedListings(category?: MarketCategory): Promise<MarketListing[]> {
  if (fixtures.isMarketDevFixtureMode()) {
    return Promise.resolve(
      fixtures
        .getDevMarketFixtures()
        .filter((item) => item.status === 'approved' || item.status === 'sold')
        .filter((item) => (category ? item.category === category : true))
    );
  }
  const key = `${MARKET_PREFIX}approved:${category ?? 'all'}`;
  return cachedFetch(key, MARKET_TTL_MS, () => supa.getApprovedListings(category));
}

export function getListing(id: string): Promise<MarketListing | null> {
  if (fixtures.isMarketDevFixtureMode()) {
    return Promise.resolve(fixtures.getDevMarketListing(id));
  }
  return supa.getListing(id);
}

export function getMyListings(userId: string): Promise<MarketListing[]> {
  if (fixtures.isMarketDevFixtureMode()) {
    return Promise.resolve(fixtures.getDevMarketFixtures().filter((item) => item.sellerId === userId));
  }
  return cachedFetch(`${MARKET_PREFIX}mine:${userId}`, MARKET_TTL_MS, () =>
    supa.getMyListings(userId)
  );
}

export async function createListing(
  sellerId: string,
  sellerName: string,
  input: MarketListingInput,
  imageFiles?: File[]
): Promise<string> {
  const id = await supa.createListing(sellerId, sellerName, input, imageFiles);
  bustMarketCache();
  return id;
}

export async function updateMyListing(
  id: string,
  input: Partial<MarketListingInput>,
  imageFiles?: File[],
  sellerId?: string
): Promise<void> {
  await supa.updateMyListing(id, input, imageFiles, sellerId);
  bustMarketCache();
}

export async function markAsSold(id: string): Promise<void> {
  if (fixtures.isMarketDevFixtureMode()) {
    fixtures.markDevMarketListingSold(id);
    bustMarketCache();
    return;
  }
  await supa.markAsSold(id);
  bustMarketCache();
}

export async function deleteMyListing(id: string): Promise<void> {
  if (fixtures.isMarketDevFixtureMode()) {
    fixtures.deleteDevMarketListing(id);
    bustMarketCache();
    return;
  }
  await supa.deleteMyListing(id);
  bustMarketCache();
}

export function incrementViewCount(id: string): Promise<void> {
  if (fixtures.isMarketDevFixtureMode()) {
    return Promise.resolve();
  }
  return supa.incrementViewCount(id);
}

export function getListingsForAdmin(status?: MarketStatus): Promise<MarketListing[]> {
  if (fixtures.isMarketDevFixtureMode()) {
    return Promise.resolve(fixtures.getDevMarketFixtures(status));
  }
  return supa.getListingsForAdmin(status);
}

export async function approveListing(
  id: string,
  reviewerId: string,
  review: Parameters<typeof supa.approveListing>[2]
): Promise<void> {
  await supa.approveListing(id, reviewerId, review);
  bustMarketCache();
}

export async function rejectListing(id: string, reviewerId: string, reason: string): Promise<void> {
  await supa.rejectListing(id, reviewerId, reason);
  bustMarketCache();
}

export async function hideListing(id: string, reviewerId: string): Promise<void> {
  if (fixtures.isMarketDevFixtureMode()) {
    fixtures.hideDevMarketListing(id);
    bustMarketCache();
    return;
  }
  await supa.hideListing(id, reviewerId);
  bustMarketCache();
}

export async function unhideListing(id: string, reviewerId: string): Promise<void> {
  if (fixtures.isMarketDevFixtureMode()) {
    fixtures.unhideDevMarketListing(id);
    bustMarketCache();
    return;
  }
  await supa.unhideListing(id, reviewerId);
  bustMarketCache();
}
