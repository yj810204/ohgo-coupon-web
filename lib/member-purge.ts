import { createAdminClient } from '@/lib/supabase/admin';
import { isFirebaseDataSource } from '@/lib/data-source';
import { resolveFirestoreUserId } from '@/lib/firebase/resolve-user-id';
import type { MemberPurgeMode, MemberPurgeResult } from '@/lib/member-purge.shared';
import { purgeFirebaseMemberData } from '@/lib/member-purge.firebase';
import {
  anonymizeKeptContent,
  deleteAuthUserIfExists,
  purgeSupabasePersonalData,
  removeMemberFromSupabaseAttendance,
} from '@/lib/member-purge.supabase';

export class MemberPurgeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type PurgeInput = {
  targetUserId: string;
  actorUserId: string;
  actorRole: string | null;
  mode: MemberPurgeMode;
  confirmName?: string;
};

function collectCandidateIds(userId: string, extra: Array<string | null | undefined>): string[] {
  return [...new Set([userId, ...extra.filter((id): id is string => Boolean(id))])];
}

type ProfileRow = {
  id: string;
  name: string;
  role: string | null;
  legacy_uuid: string | null;
};

async function resolveTargetProfile(
  admin: ReturnType<typeof createAdminClient>,
  targetUserId: string
): Promise<ProfileRow | null> {
  const byId = await admin
    .from('profiles')
    .select('id, name, role, legacy_uuid')
    .eq('id', targetUserId)
    .maybeSingle();
  if (byId.data) return byId.data as ProfileRow;

  const byLegacy = await admin
    .from('profiles')
    .select('id, name, role, legacy_uuid')
    .eq('legacy_uuid', targetUserId)
    .maybeSingle();
  return (byLegacy.data as ProfileRow | null) ?? null;
}

export async function purgeMemberAccount(input: PurgeInput): Promise<MemberPurgeResult> {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId) {
    throw new MemberPurgeError('회원 ID가 필요합니다.', 400);
  }

  if (input.mode === 'admin') {
    if (input.actorRole !== 'admin') {
      throw new MemberPurgeError('관리자만 회원을 삭제할 수 있습니다.', 403);
    }
  } else if (input.actorUserId !== targetUserId) {
    throw new MemberPurgeError('본인 계정만 탈퇴할 수 있습니다.', 403);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  let alreadyGone = false;
  let anonymized = { communityPosts: 0, comments: 0, marketListings: 0 };
  const extraIds: string[] = [];
  let supabaseUserId = targetUserId;

  if (admin) {
    const profile = await resolveTargetProfile(admin, targetUserId);

    if (profile?.role === 'admin') {
      throw new MemberPurgeError('관리자 계정은 삭제할 수 없습니다.', 403);
    }
    if (input.mode === 'self' && input.actorRole === 'admin') {
      throw new MemberPurgeError('관리자 계정은 탈퇴할 수 없습니다.', 403);
    }

    if (profile) {
      supabaseUserId = profile.id;
      if (profile.legacy_uuid) extraIds.push(profile.legacy_uuid);
    } else {
      alreadyGone = true;
    }

    anonymized = await anonymizeKeptContent(admin, supabaseUserId);
    await removeMemberFromSupabaseAttendance(admin, collectCandidateIds(supabaseUserId, extraIds));
    if (profile) {
      await purgeSupabasePersonalData(admin, supabaseUserId);
    }
    await deleteAuthUserIfExists(admin, supabaseUserId);
  } else if (input.mode === 'admin' && input.actorRole !== 'admin') {
    throw new MemberPurgeError('관리자만 회원을 삭제할 수 있습니다.', 403);
  }

  let firebasePurged = false;
  try {
    const mapped = await resolveFirestoreUserId(supabaseUserId);
    if (mapped) extraIds.push(mapped);
  } catch {
    extraIds.push(targetUserId);
  }

  if (isFirebaseDataSource() || extraIds.length > 0) {
    try {
      firebasePurged = await purgeFirebaseMemberData(collectCandidateIds(targetUserId, extraIds));
    } catch (error) {
      console.warn('[member-purge] firebase purge failed', error);
    }
  }

  return {
    ok: true,
    alreadyGone,
    anonymized,
    firebasePurged,
  };
}
