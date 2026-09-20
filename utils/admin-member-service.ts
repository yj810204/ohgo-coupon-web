import { DATA_SOURCE } from '@/lib/data-source';
import { cachedFetch, invalidateCache } from '@/lib/query-cache';
import type { AdminMember, AdminMemberStats, DuplicateMemberCandidate } from './admin-member-service.shared';
import * as supa from './admin-member-service.supabase';
import * as fb from './admin-member-service.firebase';

export type { AdminMember, AdminMemberStats, DuplicateMemberCandidate };

const impl = DATA_SOURCE === 'firebase' ? fb : supa;

const ADMIN_STATS_TTL_MS = 2 * 60_000;
const ADMIN_STATS_PREFIX = 'admin-stats:';

export function invalidateAdminMemberStatsCache() {
  invalidateCache(ADMIN_STATS_PREFIX);
}

export const listAdminMembers: typeof supa.listAdminMembers = (...a) =>
  impl.listAdminMembers(...a);
export const listAdminGuests: typeof supa.listAdminGuests = (...a) => impl.listAdminGuests(...a);
export const loadAdminMemberStats: typeof supa.loadAdminMemberStats = (uuid) =>
  cachedFetch(`${ADMIN_STATS_PREFIX}${uuid}`, ADMIN_STATS_TTL_MS, () =>
    impl.loadAdminMemberStats(uuid)
  );
export const loadAdminGuestStats: typeof supa.loadAdminGuestStats = (uuid) =>
  cachedFetch(`${ADMIN_STATS_PREFIX}guest:${uuid}`, ADMIN_STATS_TTL_MS, () =>
    impl.loadAdminGuestStats(uuid)
  );
export const getAdminGuestDetail: typeof supa.getAdminGuestDetail = (...a) =>
  impl.getAdminGuestDetail(...a);
export const adjustGuestLegacyStamps: typeof supa.adjustGuestLegacyStamps = (...a) =>
  impl.adjustGuestLegacyStamps(...a);
export const adjustGuestLegacyCoupons: typeof supa.adjustGuestLegacyCoupons = (...a) =>
  impl.adjustGuestLegacyCoupons(...a);
export const listAdminMembersActive: typeof supa.listAdminMembersActive = (...a) =>
  impl.listAdminMembersActive(...a);
export const findDuplicateUsers: typeof supa.findDuplicateUsers = (...a) =>
  impl.findDuplicateUsers(...a);
export const mergeDuplicateUsers: typeof supa.mergeDuplicateUsers = (...a) =>
  impl.mergeDuplicateUsers(...a);
