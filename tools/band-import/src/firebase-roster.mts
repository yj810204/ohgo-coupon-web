import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

export type FirebaseUserHint = { name: string; token: string | null; role: string | null; phone: string | null; dob: string | null };

let envLoaded = false;

function ensureFirebaseEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return;
  const path = join(process.cwd(), '.env.local');
  if (existsSync(path)) loadEnv({ path });
}

function firebaseTarget(): { projectId: string; apiKey: string } | null {
  ensureFirebaseEnv();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;
  return { projectId, apiKey };
}

type FirestoreValue = {
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

function stringsOf(value: FirestoreValue | undefined): string[] {
  const values = value?.arrayValue?.values ?? [];
  return values.flatMap((item) => (typeof item.stringValue === 'string' ? [item.stringValue] : []));
}

function asRecord(value: FirestoreValue | undefined): Record<string, unknown> | null {
  const fields = value?.mapValue?.fields;
  if (!fields) return null;
  const record: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field.arrayValue) record[key] = stringsOf(field);
    else if (typeof field.stringValue === 'string') record[key] = field.stringValue;
  }
  return record;
}

async function readDocument(path: string): Promise<Record<string, FirestoreValue> | null> {
  const target = firebaseTarget();
  if (!target) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${target.projectId}/databases/(default)/documents/${path}?key=${encodeURIComponent(target.apiKey)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore 조회 실패 (HTTP ${res.status})`);
  const json = (await res.json()) as { fields?: Record<string, FirestoreValue> };
  return json.fields ?? null;
}

/** 운영 승선명부. Supabase attendance 가 비어 있어도 앱은 이 문서를 본다 */
export async function readFirebaseAttendance(date: string): Promise<Record<string, unknown> | null> {
  const fields = await readDocument(`attendance/${date}`);
  if (!fields) return null;
  const confirmed = asRecord(fields.confirmedMembers) ?? {};
  return {
    members: stringsOf(fields.members),
    confirmedMembers: confirmed,
  };
}

export async function readFirebaseUsers(ids: string[]): Promise<Map<string, FirebaseUserHint>> {
  const out = new Map<string, FirebaseUserHint>();
  if (!firebaseTarget() || !ids.length) return out;
  await Promise.all(ids.map(async (id) => {
    const fields = await readDocument(`users/${encodeURIComponent(id)}`);
    if (!fields) return;
    const name = fields.name?.stringValue?.trim() || id;
    const token = fields.expoPushToken?.stringValue?.trim() || null;
    const role = fields.role?.stringValue?.trim() || null;
    const phone = fields.phone?.stringValue?.trim() || null;
    const dob = fields.dob?.stringValue?.trim() || null;
    out.set(id, { name, token, role, phone, dob });
  }));
  return out;
}
