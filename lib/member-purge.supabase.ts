import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COMMENT_ANONYMIZE_FIELDS,
  COMMUNITY_ANONYMIZE_FIELDS,
  MARKET_ANONYMIZE_FIELDS,
  removeIdsFromConfirmedMembers,
  removeIdsFromList,
  WITHDRAWN_MEMBER_LABEL,
} from '@/lib/member-purge.shared';

const AVATAR_BUCKET = 'photos';

async function ignoreSchemaError<T>(
  run: () => PromiseLike<{ data: T; error: { message?: string } | null }>
): Promise<T | null> {
  const { data, error } = await run();
  if (!error) return data;
  const message = error.message || '';
  if (/does not exist|schema cache|column/i.test(message)) return null;
  throw error;
}

async function deleteByUserId(admin: SupabaseClient, table: string, column: string, userId: string) {
  const { error } = await admin.from(table).delete().eq(column, userId);
  if (error && !/does not exist|schema cache/i.test(error.message || '')) {
    throw error;
  }
}

export async function anonymizeKeptContent(
  admin: SupabaseClient,
  userId: string
): Promise<{ communityPosts: number; comments: number; marketListings: number }> {
  const photos = await admin
    .from('community_photos')
    .update(COMMUNITY_ANONYMIZE_FIELDS)
    .eq('uploaded_by', userId)
    .select('id');
  if (photos.error && !/does not exist|schema cache/i.test(photos.error.message || '')) {
    throw photos.error;
  }

  const comments = await admin
    .from('comments')
    .update(COMMENT_ANONYMIZE_FIELDS)
    .eq('user_id', userId)
    .select('id');
  if (comments.error && !/does not exist|schema cache/i.test(comments.error.message || '')) {
    throw comments.error;
  }

  const listings = await admin
    .from('market_listings')
    .update(MARKET_ANONYMIZE_FIELDS)
    .eq('seller_id', userId)
    .select('id');
  if (listings.error && !/does not exist|schema cache/i.test(listings.error.message || '')) {
    throw listings.error;
  }

  const detachSeller = await admin
    .from('market_listings')
    .update({ seller_id: null })
    .eq('seller_id', userId)
    .select('id');
  if (
    detachSeller.error &&
    !/does not exist|schema cache|null value|not-null|seller_id/i.test(detachSeller.error.message || '')
  ) {
    throw detachSeller.error;
  }

  await admin
    .from('captain_photo_tags')
    .update({ user_name: WITHDRAWN_MEMBER_LABEL, user_id: null })
    .eq('user_id', userId);

  await admin
    .from('trip_reservations')
    .update({ user_name: WITHDRAWN_MEMBER_LABEL, user_phone: null })
    .eq('user_id', userId);

  await admin
    .from('direct_sale_orders')
    .update({ buyer_name: WITHDRAWN_MEMBER_LABEL, buyer_phone: null })
    .eq('buyer_id', userId);

  await admin
    .from('restaurant_bookings')
    .update({ user_name: WITHDRAWN_MEMBER_LABEL, user_phone: null })
    .eq('user_id', userId);

  return {
    communityPosts: photos.data?.length ?? 0,
    comments: comments.data?.length ?? 0,
    marketListings: listings.data?.length ?? 0,
  };
}

export async function removeMemberFromSupabaseAttendance(admin: SupabaseClient, userIds: string[]) {
  const drop = userIds.filter(Boolean);
  if (drop.length === 0) return;

  const withConfirmed = await ignoreSchemaError(() =>
    admin.from('attendance').select('date, members, confirmed_members')
  );
  const rows =
    withConfirmed ??
    (await ignoreSchemaError(() => admin.from('attendance').select('date, members'))) ??
    [];

  for (const row of rows as Array<Record<string, unknown>>) {
    const date = String(row.date ?? '');
    if (!date) continue;
    const members = removeIdsFromList(row.members, drop);
    const confirmed = removeIdsFromConfirmedMembers(row.confirmed_members, drop);
    if (!members.changed && !confirmed.changed) continue;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (members.changed) patch.members = members.next;
    if (confirmed.changed && confirmed.next) patch.confirmed_members = confirmed.next;
    const { error } = await admin.from('attendance').update(patch).eq('date', date);
    if (error && !/confirmed_members/i.test(error.message || '')) {
      throw error;
    }
  }
}

async function deleteAvatarFiles(admin: SupabaseClient, userId: string) {
  const folder = `avatars/${userId}`;
  const { data } = await admin.storage.from(AVATAR_BUCKET).list(folder, { limit: 20 });
  const paths = (data ?? []).map((file) => `${folder}/${file.name}`);
  if (paths.length === 0) return;
  await admin.storage.from(AVATAR_BUCKET).remove(paths);
}

export async function purgeSupabasePersonalData(admin: SupabaseClient, userId: string) {
  const personalTables: Array<[string, string]> = [
    ['trip_reservations', 'user_id'],
    ['restaurant_bookings', 'user_id'],
    ['qr_scan_activity_logs', 'user_id'],
    ['captain_photo_tags', 'user_id'],
    ['boarding_info', 'user_id'],
    ['stamps', 'user_id'],
    ['stamp_history', 'user_id'],
    ['coupons', 'user_id'],
    ['user_action_logs', 'user_id'],
    ['user_memos', 'user_id'],
    ['points', 'user_id'],
    ['bait_usage', 'user_id'],
    ['game_scores', 'user_id'],
    ['point_mall_orders', 'user_id'],
  ];

  for (const [table, column] of personalTables) {
    await deleteByUserId(admin, table, column, userId);
  }

  await deleteAvatarFiles(admin, userId);

  const { error } = await admin.from('profiles').delete().eq('id', userId);
  if (error && !/does not exist|schema cache/i.test(error.message || '')) {
    throw error;
  }
}

export async function deleteAuthUserIfExists(admin: SupabaseClient, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (!error) return;
  const message = error.message || '';
  if (/not found|user not found|does not exist/i.test(message)) return;
  throw error;
}
