export type StoredUser = {
  uuid: string;
  name: string;
  dob: string;
  isAdmin?: boolean;
  fbUid?: string;
  legacyUuid?: string;
};

export function mergeStoredUser(previous: StoredUser | null, next: StoredUser): StoredUser {
  if (!previous || previous.uuid !== next.uuid) return { ...next };
  return {
    ...previous,
    ...next,
    name: next.name?.trim() ? next.name : previous.name,
    dob: next.dob?.trim() ? next.dob : previous.dob,
    fbUid: next.fbUid || previous.fbUid,
    legacyUuid: next.legacyUuid || previous.legacyUuid,
  };
}

/** 프로필 조회가 성공하면 기기에 남은 빈 생년월일을 고치고 Firestore id를 남긴다. */
export function storedUserFromProfile(
  profile: {
    id: string;
    name: string;
    dob: string | null;
    role: string;
    legacy_uuid?: string | null;
  },
  previous?: StoredUser | null,
): StoredUser {
  const legacy = profile.legacy_uuid?.trim() || undefined;
  return mergeStoredUser(previous ?? null, {
    uuid: profile.id,
    name: profile.name,
    dob: profile.dob ?? '',
    isAdmin: profile.role === 'admin',
    fbUid: legacy,
    legacyUuid: legacy,
  });
}
