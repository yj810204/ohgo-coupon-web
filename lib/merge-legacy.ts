import { createAdminClient } from '@/lib/supabase/admin';
import { computeLegacyUuid, normalizeDob } from '@/lib/legacy-uuid';
import { applyLegacyStagingToProfile } from '@/lib/apply-legacy-staging';

const USER_DATA_TABLES = [
  'stamps',
  'coupons',
  'stamp_history',
  'user_action_logs',
  'user_memos',
  'points',
  'bait_usage',
] as const;

export type MergeLegacyResult = {
  legacyUuid: string;
  merged: boolean;
  mergedFromGuest: boolean;
  mergedFromFirebase: boolean;
  message: string;
};

async function replaceMemberInAttendance(
  admin: ReturnType<typeof createAdminClient>,
  legacyUuid: string,
  authUserId: string
) {
  const { data: rows, error } = await admin.from('attendance').select('date, members');
  if (error) throw error;

  for (const row of rows ?? []) {
    const members = (row.members ?? []) as string[];
    if (!members.some((m) => String(m) === legacyUuid)) continue;

    const updated = members.map((m) => (String(m) === legacyUuid ? authUserId : String(m)));
    const { error: updateError } = await admin
      .from('attendance')
      .update({ members: updated, updated_at: new Date().toISOString() })
      .eq('date', row.date);
    if (updateError) throw updateError;
  }
}

async function reassignUserData(
  admin: ReturnType<typeof createAdminClient>,
  legacyUuid: string,
  authUserId: string
) {
  if (legacyUuid === authUserId) return;

  for (const table of USER_DATA_TABLES) {
    const { error } = await admin.from(table).update({ user_id: authUserId }).eq('user_id', legacyUuid);
    if (error) {
      console.warn(`merge-legacy: ${table} skip`, error.message);
    }
  }
}

async function mergeGuestBoarding(
  admin: ReturnType<typeof createAdminClient>,
  legacyUuid: string,
  authUserId: string
) {
  const { data: guestBoarding, error } = await admin
    .from('guest_boarding_info')
    .select('*')
    .eq('guest_id', legacyUuid)
    .maybeSingle();

  if (error) throw error;
  if (!guestBoarding) return;

  const { data: existing } = await admin
    .from('boarding_info')
    .select('user_id')
    .eq('user_id', authUserId)
    .maybeSingle();

  // 기존 회원의 명부 데이터는 절대 덮어쓰지 않음
  if (existing) return;

  const { error: insertError } = await admin.from('boarding_info').insert({
    user_id: authUserId,
    name: guestBoarding.name,
    birth: guestBoarding.birth,
    gender: guestBoarding.gender,
    phone: guestBoarding.phone,
    emergency: guestBoarding.emergency,
    address: guestBoarding.address,
    address_detail: guestBoarding.address_detail,
    agreed: guestBoarding.agreed,
    agreed_third_party: guestBoarding.agreed_third_party,
    trip_role: guestBoarding.trip_role,
    photo_consent: guestBoarding.agreed,
    updated_at: new Date().toISOString(),
  });
  if (insertError) throw insertError;
}

/** 런타임 Firebase import는 사용하지 않음. offline 배치(scripts/)만 사용. */
async function tryImportGuestFromFirebase(_legacyUuid: string): Promise<boolean> {
  return false;
}

export async function mergeLegacyAccount(
  authUserId: string,
  name: string,
  dobInput: string,
  options?: { legacyUuidOverride?: string; skipFirebaseImport?: boolean }
): Promise<MergeLegacyResult> {
  const normalizedDob = normalizeDob(dobInput);
  if (!normalizedDob) {
    throw new Error('생년월일 형식이 잘못되었습니다.');
  }

  const legacyUuid = options?.legacyUuidOverride ?? computeLegacyUuid(name, dobInput);
  const admin = createAdminClient();

  const { data: currentProfile, error: profileReadError } = await admin
    .from('profiles')
    .select('id, legacy_uuid, dob, name, phone')
    .eq('id', authUserId)
    .maybeSingle();

  if (profileReadError) throw profileReadError;
  if (!currentProfile) throw new Error('프로필을 찾을 수 없습니다.');

  if (currentProfile.legacy_uuid === legacyUuid) {
    // 이미 연결됨 — staging만 반영 시도 (프로필/명부 원본은 수정하지 않음)
    try {
      await applyLegacyStagingToProfile(admin, legacyUuid, authUserId);
    } catch (e) {
      console.warn('merge-legacy staging apply (already linked):', e);
    }
    return {
      legacyUuid,
      merged: false,
      mergedFromGuest: false,
      mergedFromFirebase: false,
      message: '프로필이 이미 설정되어 있습니다.',
    };
  }

  if (currentProfile.legacy_uuid && currentProfile.legacy_uuid !== legacyUuid) {
    throw new Error('이미 다른 게스트 계정과 연결되어 있습니다.');
  }

  const { data: legacyTaken } = await admin
    .from('profiles')
    .select('id')
    .eq('legacy_uuid', legacyUuid)
    .neq('id', authUserId)
    .maybeSingle();

  if (legacyTaken) {
    throw new Error('해당 게스트 계정은 이미 다른 회원과 연결되었습니다.');
  }

  let { data: guest } = await admin
    .from('guest_profiles')
    .select('id, phone, merged_to')
    .eq('id', legacyUuid)
    .maybeSingle();

  let mergedFromFirebase = false;
  if (!guest && !options?.skipFirebaseImport) {
    mergedFromFirebase = await tryImportGuestFromFirebase(legacyUuid);
    if (mergedFromFirebase) {
      const res = await admin
        .from('guest_profiles')
        .select('id, phone, merged_to')
        .eq('id', legacyUuid)
        .maybeSingle();
      guest = res.data;
    }
  }

  const guestPhone = guest?.phone ?? null;

  // 기존 회원의 name/dob/phone 은 절대 덮어쓰지 않음. legacy_uuid 연결 + 빈 phone만 채움.
  const profilePatch: Record<string, string> = { legacy_uuid: legacyUuid };
  if (!currentProfile.phone && guestPhone) {
    profilePatch.phone = guestPhone;
  }
  if (!currentProfile.name?.trim() && name.trim()) {
    profilePatch.name = name.trim();
  }
  if (!currentProfile.dob && normalizedDob) {
    profilePatch.dob = normalizedDob;
  }

  const { error: profileUpdateError } = await admin
    .from('profiles')
    .update(profilePatch)
    .eq('id', authUserId);

  if (profileUpdateError) throw profileUpdateError;

  let mergedFromGuest = false;

  if (guest && !guest.merged_to) {
    await mergeGuestBoarding(admin, legacyUuid, authUserId);
    await reassignUserData(admin, legacyUuid, authUserId);
    await replaceMemberInAttendance(admin, legacyUuid, authUserId);

    const { error: guestMergeError } = await admin
      .from('guest_profiles')
      .update({ merged_to: authUserId, merged_at: new Date().toISOString() })
      .eq('id', legacyUuid);

    if (guestMergeError) throw guestMergeError;
    mergedFromGuest = true;
  }

  // Firebase staging(스탬프/쿠폰) → live 테이블
  let stagingApplied = false;
  try {
    const applied = await applyLegacyStagingToProfile(admin, legacyUuid, authUserId);
    stagingApplied = applied.stamps + applied.coupons + applied.history > 0;
  } catch (e) {
    console.warn('merge-legacy staging apply:', e);
  }

  const merged = mergedFromGuest || mergedFromFirebase || stagingApplied;

  return {
    legacyUuid,
    merged,
    mergedFromGuest,
    mergedFromFirebase,
    message: merged
      ? stagingApplied
        ? '게스트·스탬프·쿠폰 데이터가 연결되었습니다.'
        : '승선명부 게스트 데이터가 연결되었습니다.'
      : '프로필이 저장되었습니다.',
  };
}

export async function adminMergeGuestToUser(guestLegacyId: string, targetUserId: string) {
  const admin = createAdminClient();

  const { data: guest, error: guestError } = await admin
    .from('guest_profiles')
    .select('name, dob, merged_to')
    .eq('id', guestLegacyId)
    .maybeSingle();

  if (guestError) throw guestError;
  if (!guest) throw new Error('게스트를 찾을 수 없습니다.');
  if (guest.merged_to) throw new Error('이미 병합된 게스트입니다.');

  return mergeLegacyAccount(targetUserId, guest.name, guest.dob, {
    legacyUuidOverride: guestLegacyId,
    skipFirebaseImport: true,
  });
}
