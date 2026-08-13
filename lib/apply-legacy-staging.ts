import type { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

export type ApplyLegacyStagingResult = {
  stamps: number;
  coupons: number;
  history: number;
};

/**
 * staging(legacy_*) → live stamps/coupons/stamp_history.
 * profiles FK를 지키기 위해 auth profile id에만 기록한다.
 */
export async function applyLegacyStagingToProfile(
  admin: AdminClient,
  legacyUuid: string,
  profileId: string
): Promise<ApplyLegacyStagingResult> {
  const result: ApplyLegacyStagingResult = { stamps: 0, coupons: 0, history: 0 };
  const now = new Date().toISOString();

  const { data: pendingStamps, error: stampsErr } = await admin
    .from('legacy_stamps')
    .select('id, date, method, created_at')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null);

  if (stampsErr) throw stampsErr;

  for (const row of pendingStamps ?? []) {
    const { error: insertError } = await admin.from('stamps').insert({
      user_id: profileId,
      date: row.date,
      method: row.method || 'QR',
      created_at: row.created_at || now,
    });
    if (insertError) {
      console.warn('apply-legacy-staging stamps:', insertError.message);
      continue;
    }
    const { error: markError } = await admin
      .from('legacy_stamps')
      .update({ applied_profile_id: profileId, applied_at: now })
      .eq('id', row.id);
    if (markError) console.warn('apply-legacy-staging stamps mark:', markError.message);
    else result.stamps += 1;
  }

  const { data: pendingCoupons, error: couponsErr } = await admin
    .from('legacy_coupons')
    .select('id, reason, is_half, used, used_at, issued_at, deleted, created_at')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null);

  if (couponsErr) throw couponsErr;

  for (const row of pendingCoupons ?? []) {
    if (row.deleted) {
      await admin
        .from('legacy_coupons')
        .update({ applied_profile_id: profileId, applied_at: now })
        .eq('id', row.id);
      continue;
    }
    const { error: insertError } = await admin.from('coupons').insert({
      user_id: profileId,
      reason: row.reason,
      is_half: Boolean(row.is_half),
      used: Boolean(row.used),
      used_at: row.used_at,
      issued_at: row.issued_at,
      created_at: row.created_at || now,
    });
    if (insertError) {
      console.warn('apply-legacy-staging coupons:', insertError.message);
      continue;
    }
    const { error: markError } = await admin
      .from('legacy_coupons')
      .update({ applied_profile_id: profileId, applied_at: now })
      .eq('id', row.id);
    if (markError) console.warn('apply-legacy-staging coupons mark:', markError.message);
    else result.coupons += 1;
  }

  const { data: pendingHistory, error: historyErr } = await admin
    .from('legacy_stamp_history')
    .select('id, action, date, method, message, created_at')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null);

  if (historyErr) throw historyErr;

  for (const row of pendingHistory ?? []) {
    const { error: insertError } = await admin.from('stamp_history').insert({
      user_id: profileId,
      stamp_id: null,
      action: row.action,
      date: row.date,
      method: row.method,
      message: row.message,
      created_at: row.created_at || now,
    });
    if (insertError) {
      console.warn('apply-legacy-staging history:', insertError.message);
      continue;
    }
    const { error: markError } = await admin
      .from('legacy_stamp_history')
      .update({ applied_profile_id: profileId, applied_at: now })
      .eq('id', row.id);
    if (markError) console.warn('apply-legacy-staging history mark:', markError.message);
    else result.history += 1;
  }

  return result;
}
