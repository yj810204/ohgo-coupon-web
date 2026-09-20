import { createHash, createHmac } from 'crypto';
import { doc, getDoc } from 'firebase/firestore';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeLegacyUuid, normalizeDob } from '@/lib/legacy-uuid';
import { applyLegacyStagingToProfile } from '@/lib/apply-legacy-staging';
import { getHomePathForUser, type AppUser } from '@/lib/auth-session';

const LEGACY_EMAIL_DOMAIN = 'legacy.ohgo.local';

function legacyEmail(legacyUuid: string) {
  return `legacy-${legacyUuid}@${LEGACY_EMAIL_DOMAIN}`;
}

function legacyPassword(legacyUuid: string) {
  const secret =
    process.env.LEGACY_LOGIN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'ohgo-legacy-login';
  return createHmac('sha256', secret).update(`legacy-login:${legacyUuid}`).digest('hex');
}

function mapFirebaseRoleToProfileRole(fb: {
  isAdmin?: boolean;
  role?: string | null;
}): 'admin' | 'captain' | 'member' {
  if (fb.isAdmin === true) return 'admin';
  if (fb.role === 'captain') return 'captain';
  return 'member';
}

export type LegacyLoginResult = {
  access_token: string;
  refresh_token: string;
  homePath: string;
  user: {
    uuid: string;
    name: string;
    dob: string;
    isAdmin: boolean;
    isCaptain: boolean;
  };
};

/**
 * 구앱과 동일한 이름+생년월일 로그인 (기등록 회원만).
 * - supabase 모드: guest_profiles 또는 profiles.legacy_uuid
 * - firebase 모드: Firestore users/{uuidv5} 존재 (역할을 Supabase profiles에 동기화)
 */
export async function legacyLoginWithNameDob(
  nameInput: string,
  dobInput: string
): Promise<LegacyLoginResult> {
  const name = nameInput.trim();
  const normalizedDob = normalizeDob(dobInput);
  if (!name) throw new Error('이름을 입력해 주세요.');
  if (!normalizedDob) throw new Error('생년월일은 6자리 또는 8자리로 입력해 주세요.');

  const legacyUuid = computeLegacyUuid(name, dobInput);
  const admin = createAdminClient();
  const password = legacyPassword(legacyUuid);
  const email = legacyEmail(legacyUuid);

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, name, dob, role, legacy_uuid')
    .eq('legacy_uuid', legacyUuid)
    .maybeSingle();

  const { data: guest } = await admin
    .from('guest_profiles')
    .select('id, name, dob, phone, merged_to')
    .eq('id', legacyUuid)
    .maybeSingle();

  type FirebaseUserDoc = {
    name?: string;
    dob?: string;
    phone?: string;
    isAdmin?: boolean;
    role?: string | null;
  };
  let firebaseUser: FirebaseUserDoc | null = null;
  if (isFirebaseDataSource()) {
    const fbSnap = await getDoc(doc(getFirebaseDb(), 'users', legacyUuid));
    if (fbSnap.exists()) {
      firebaseUser = fbSnap.data() as FirebaseUserDoc;
    }
  }

  if (!existingProfile && !guest && !firebaseUser) {
    throw new Error(
      isFirebaseDataSource()
        ? '등록된 회원을 찾을 수 없습니다. 구앱에 등록된 이름·생년월일로 로그인해 주세요.'
        : '등록된 회원을 찾을 수 없습니다. 구앱 회원 이관 후 이용하거나 Google 로그인을 사용해 주세요.'
    );
  }

  // 이미 legacy_uuid 가 연결된 프로필이 있으면 그 id 로 로그인한다.
  // (firebase 모드에서 uuidv5 를 강제하면 이미 연결된 기존 행과
  //  profiles_legacy_uuid_key 충돌이 난다.)
  // 연결 프로필이 없을 때만 firebase 모드에서 Firestore 문서 id(=uuidv5)를 사용.
  let authUserId: string | null =
    existingProfile?.id ??
    guest?.merged_to ??
    (isFirebaseDataSource() ? legacyUuid : null);

  async function ensureAuthUser(targetId: string) {
    const { data: existingAuth } = await admin.auth.admin.getUserById(targetId);
    if (existingAuth?.user) {
      const patch: { password: string; email?: string; email_confirm?: boolean } = {
        password,
        email_confirm: true,
      };
      if (!existingAuth.user.email) patch.email = email;
      const { error: updateError } = await admin.auth.admin.updateUserById(targetId, patch);
      if (updateError) throw new Error(updateError.message || '로그인 준비에 실패했습니다.');
      return targetId;
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      id: targetId,
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        dob: normalizedDob,
        legacy_uuid: legacyUuid,
        auth_provider: 'legacy',
      },
    });

    if (createError) {
      const { data: byId } = await admin.auth.admin.getUserById(targetId);
      if (byId?.user) {
        await admin.auth.admin.updateUserById(targetId, { password, email_confirm: true });
        return targetId;
      }
      throw new Error(createError.message || '계정 생성에 실패했습니다.');
    }
    return created.user.id;
  }

  if (!authUserId) {
    authUserId = await ensureAuthUser(legacyUuid);
  } else {
    const { data: authUserData, error: getUserError } = await admin.auth.admin.getUserById(authUserId);
    if (getUserError || !authUserData.user) {
      // firebase 모드 등: profiles/uuid 는 있는데 auth.users 가 없는 경우 생성
      authUserId = await ensureAuthUser(authUserId);
    } else {
      const patch: { password: string; email?: string; email_confirm?: boolean } = {
        password,
        email_confirm: true,
      };
      if (!authUserData.user.email) patch.email = email;
      const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, patch);
      if (updateError) throw new Error(updateError.message || '로그인 준비에 실패했습니다.');
    }
  }

  // 프로필 보장 + 레거시 연결 (기존 회원 name/dob/phone 은 절대 덮어쓰지 않음)
  // firebase 모드: Firestore isAdmin/role → profiles.role 단방향 동기화
  const syncedRole = firebaseUser
    ? mapFirebaseRoleToProfileRole({
        isAdmin: firebaseUser.isAdmin,
        role: firebaseUser.role,
      })
    : null;

  let { data: profileRow } = await admin
    .from('profiles')
    .select('id, name, dob, role, legacy_uuid, phone')
    .eq('id', authUserId)
    .maybeSingle();

  // auth.users 생성 트리거로 profiles 행만 생긴 경우 등 — legacy_uuid 소유자가 다른 행이면 그쪽으로 전환
  if (profileRow && profileRow.legacy_uuid && profileRow.legacy_uuid !== legacyUuid) {
    throw new Error('이 계정은 다른 회원 정보와 연결되어 있습니다. 관리자에게 문의해 주세요.');
  }

  if (!profileRow) {
    const { error: insertError } = await admin.from('profiles').insert({
      id: authUserId,
      name: firebaseUser?.name || guest?.name || name,
      dob: firebaseUser?.dob || guest?.dob || normalizedDob,
      role: syncedRole ?? 'member',
      legacy_uuid: legacyUuid,
      phone: firebaseUser?.phone || guest?.phone || null,
    });
    if (insertError) {
      // 동시 요청·트리거 레이스로 legacy_uuid 가 이미 있으면 기존 프로필로 로그인
      const { data: conflictProfile } = await admin
        .from('profiles')
        .select('id, name, dob, role, legacy_uuid, phone')
        .eq('legacy_uuid', legacyUuid)
        .maybeSingle();
      if (conflictProfile) {
        authUserId = conflictProfile.id;
        profileRow = conflictProfile;
        await ensureAuthUser(authUserId);
      } else if (insertError.code === '23505') {
        // id 충돌: 트리거가 먼저 만든 행 — update 경로로
        const { data: triggered } = await admin
          .from('profiles')
          .select('id, name, dob, role, legacy_uuid, phone')
          .eq('id', authUserId)
          .maybeSingle();
        if (!triggered) throw new Error(insertError.message);
        profileRow = triggered;
      } else {
        throw new Error(insertError.message);
      }
    }
  }

  if (profileRow) {
    const profilePatch: Record<string, string> = {};
    if (!profileRow.legacy_uuid) {
      const { data: legacyTaken } = await admin
        .from('profiles')
        .select('id')
        .eq('legacy_uuid', legacyUuid)
        .neq('id', authUserId)
        .maybeSingle();
      if (legacyTaken) {
        // 다른 프로필이 이미 소유 → 그 계정으로 전환
        authUserId = legacyTaken.id;
        await ensureAuthUser(authUserId);
        const { data: owner } = await admin
          .from('profiles')
          .select('id, name, dob, role, legacy_uuid, phone')
          .eq('id', authUserId)
          .maybeSingle();
        profileRow = owner;
      } else {
        profilePatch.legacy_uuid = legacyUuid;
      }
    }
    if (profileRow) {
      if (!profileRow.phone && (firebaseUser?.phone || guest?.phone)) {
        profilePatch.phone = String(firebaseUser?.phone || guest?.phone);
      }
      if (!profileRow.name?.trim()) {
        profilePatch.name = firebaseUser?.name || guest?.name || name;
      }
      if (!profileRow.dob) {
        profilePatch.dob = firebaseUser?.dob || guest?.dob || normalizedDob;
      }
      if (syncedRole && profileRow.role !== syncedRole) {
        profilePatch.role = syncedRole;
      }
      if (Object.keys(profilePatch).length > 0) {
        const { error: updateError } = await admin
          .from('profiles')
          .update(profilePatch)
          .eq('id', authUserId);
        if (updateError) {
          if (updateError.code === '23505' && profilePatch.legacy_uuid) {
            const { data: owner } = await admin
              .from('profiles')
              .select('id')
              .eq('legacy_uuid', legacyUuid)
              .maybeSingle();
            if (owner) {
              authUserId = owner.id;
              await ensureAuthUser(authUserId);
            } else {
              throw new Error(updateError.message);
            }
          } else {
            throw new Error(updateError.message);
          }
        }
      }
    }
  }

  if (guest && !guest.merged_to) {
    const { data: boarding } = await admin
      .from('guest_boarding_info')
      .select('*')
      .eq('guest_id', legacyUuid)
      .maybeSingle();

    // 기존 boarding_info 가 있으면 덮어쓰지 않음
    if (boarding) {
      const { data: existingBoarding } = await admin
        .from('boarding_info')
        .select('user_id')
        .eq('user_id', authUserId)
        .maybeSingle();

      if (!existingBoarding) {
        await admin.from('boarding_info').insert({
          user_id: authUserId,
          name: boarding.name,
          birth: boarding.birth,
          gender: boarding.gender,
          phone: boarding.phone,
          emergency: boarding.emergency,
          address: boarding.address,
          address_detail: boarding.address_detail,
          agreed: boarding.agreed,
          agreed_third_party: boarding.agreed_third_party,
          trip_role: boarding.trip_role,
          photo_consent: boarding.agreed,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // guest_profiles 신원 필드는 수정하지 않고 연결 표시만 갱신
    await admin
      .from('guest_profiles')
      .update({ merged_to: authUserId, merged_at: new Date().toISOString() })
      .eq('id', legacyUuid)
      .is('merged_to', null);
  }

  try {
    await applyLegacyStagingToProfile(admin, legacyUuid, authUserId);
  } catch (e) {
    console.warn('legacy-login staging apply:', e);
  }

  const { data: authUserData } = await admin.auth.admin.getUserById(authUserId);
  const signInEmail = authUserData.user?.email || email;

  const { data: sessionData, error: signInError } = await admin.auth.signInWithPassword({
    email: signInEmail,
    password,
  });

  if (signInError || !sessionData.session) {
    throw new Error(signInError?.message || '세션 생성에 실패했습니다.');
  }

  const { data: finalProfile } = await admin
    .from('profiles')
    .select('id, name, dob, role')
    .eq('id', authUserId)
    .single();

  const appUser: AppUser = {
    uuid: authUserId,
    name: finalProfile?.name || name,
    dob: finalProfile?.dob || normalizedDob,
    isAdmin: finalProfile?.role === 'admin',
    isCaptain: finalProfile?.role === 'captain',
  };

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    homePath: getHomePathForUser(appUser),
    user: {
      uuid: appUser.uuid,
      name: appUser.name,
      dob: appUser.dob,
      isAdmin: appUser.isAdmin,
      isCaptain: !!appUser.isCaptain,
    },
  };
}

/** 레이트 리밋용 간단 지문 (로깅) */
export function legacyLoginFingerprint(name: string, dob: string) {
  return createHash('sha256').update(`${name.trim()}|${normalizeDob(dob) || dob}`).digest('hex').slice(0, 12);
}
