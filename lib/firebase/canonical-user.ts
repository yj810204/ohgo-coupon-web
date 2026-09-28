import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { followMergedToChain } from '@/lib/firebase/merged-to';
import { listLegacyUuidCandidates } from '@/lib/legacy-uuid';
import { personIdentityKey } from '@/lib/person-name';
import { createAdminClient } from '@/lib/supabase/admin';

export type CanonicalUserLookup = {
  id: string;
  hops: string[];
  cycle: boolean;
  missing: boolean;
  data: Record<string, unknown> | null;
};

async function loadUserDocs(
  ids: string[]
): Promise<Record<string, { mergedTo?: string | null; data: Record<string, unknown> } | null>> {
  const db = getFirebaseDb();
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  const out: Record<string, { mergedTo?: string | null; data: Record<string, unknown> } | null> = {};
  await Promise.all(
    unique.map(async (id) => {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) {
        out[id] = null;
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      out[id] = {
        mergedTo: data.mergedTo ? String(data.mergedTo) : null,
        data,
      };
    })
  );
  return out;
}

/**
 * Firestore `users/{id}` 가 병합된 문서면 실제(살아있는) 계정까지 따라간다.
 */
export async function resolveCanonicalUserId(startId: string): Promise<CanonicalUserLookup> {
  const empty: CanonicalUserLookup = {
    id: startId,
    hops: startId ? [startId] : [],
    cycle: false,
    missing: true,
    data: null,
  };
  if (!startId) return empty;

  const loaded: Record<string, { mergedTo?: string | null; data: Record<string, unknown> } | null> = {};
  let pending = [startId];

  for (let i = 0; i < 8 && pending.length; i += 1) {
    const batch = pending.filter((id) => !(id in loaded));
    if (batch.length === 0) break;
    Object.assign(loaded, await loadUserDocs(batch));
    pending = [];
    const chain = followMergedToChain(startId, loaded);
    const last = chain.hops[chain.hops.length - 1];
    const lastDoc = last ? loaded[last] : null;
    const next = lastDoc?.mergedTo ? String(lastDoc.mergedTo) : '';
    if (next && !(next in loaded) && !chain.cycle) {
      pending.push(next);
    }
  }

  const chain = followMergedToChain(startId, loaded);
  const data = loaded[chain.id]?.data ?? null;
  return {
    ...chain,
    missing: chain.missing || !data,
    data,
  };
}

export async function lookupUserByLegacyUuidCandidates(
  name: string,
  dob: string
): Promise<CanonicalUserLookup | null> {
  let candidates: string[];
  try {
    candidates = listLegacyUuidCandidates(name, dob);
  } catch {
    return null;
  }

  for (const candidate of candidates) {
    const resolved = await resolveCanonicalUserId(candidate);
    if (!resolved.missing && resolved.data) return resolved;
  }
  return null;
}

/** 정규화 이름+생년월일로 살아있는 users 문서를 찾는다. 후보 UUID가 없을 때만 전체 스캔. */
export async function findActiveUserByNameDob(name: string, dob: string): Promise<string | null> {
  const byUuid = await lookupUserByLegacyUuidCandidates(name, dob);
  if (byUuid && !byUuid.missing) return byUuid.id;

  const key = personIdentityKey(name, dob);
  if (key.startsWith('|') || key.endsWith('|')) return null;

  const db = getFirebaseDb();
  const snap = await getDocs(collection(db, 'users'));
  for (const d of snap.docs) {
    const data = d.data();
    if (data.mergedTo) continue;
    if (personIdentityKey(String(data.name ?? ''), String(data.dob ?? '')) === key) {
      return d.id;
    }
  }
  return null;
}

export async function healProfileLegacyUuid(profileId: string, canonicalUuid: string): Promise<void> {
  if (!profileId || !canonicalUuid) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const admin = createAdminClient();
    const { data: current } = await admin
      .from('profiles')
      .select('id, legacy_uuid')
      .eq('id', profileId)
      .maybeSingle();
    if (!current) return;
    if (current.legacy_uuid === canonicalUuid) return;

    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .eq('legacy_uuid', canonicalUuid)
      .neq('id', profileId)
      .maybeSingle();
    if (taken) return;

    const { error } = await admin
      .from('profiles')
      .update({ legacy_uuid: canonicalUuid })
      .eq('id', profileId);
    if (error) {
      console.warn('healProfileLegacyUuid:', error.message);
    }
  } catch (e) {
    console.warn('healProfileLegacyUuid:', e);
  }
}
