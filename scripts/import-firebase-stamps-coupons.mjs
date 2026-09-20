#!/usr/bin/env node
/**
 * Firebase users/{uuid}/stamps|coupons|stampHistory → Supabase legacy_* staging
 * (이미 profiles.legacy_uuid 연결된 유저는 live 테이블로 즉시 apply)
 *
 * 사용법:
 *   node scripts/import-firebase-stamps-coupons.mjs --dry-run --limit 5
 *   node scripts/import-firebase-stamps-coupons.mjs --cutover --limit 5
 *   node scripts/import-firebase-stamps-coupons.mjs --cutover --legacy-uuid=<uuidv5>
 *   node scripts/import-firebase-stamps-coupons.mjs --cutover
 *
 * 구앱 병행 중에는 실행하지 마세요. baitCoupons 를 지금 복사하면 미끼 지갑이 둘로 갈라집니다.
 * 전원 신앱 이후 Phase 3 에서만 --cutover 로 실기록.
 *
 * 사전: supabase/migrations/016_legacy_firebase_staging.sql 적용
 * 문서: scripts/FIREBASE_MIGRATION.md
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const cutover = args.includes('--cutover');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : args.includes('--limit')
  ? Number(args[args.indexOf('--limit') + 1])
  : null;
const legacyArg = args.find((a) => a.startsWith('--legacy-uuid='));
const onlyLegacyUuid = legacyArg?.split('=')[1] || null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!supabaseUrl || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}
if (!firebaseConfig.projectId) {
  console.error('Firebase env 설정 필요');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const db = getFirestore(initializeApp(firebaseConfig));

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }
  return null;
}

function issuedAtToText(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function isHalfBool(value) {
  if (value === true || value === 'Y' || value === 'y') return true;
  return false;
}

async function resolveProfileId(legacyUuid) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('legacy_uuid', legacyUuid)
    .maybeSingle();
  return data?.id ?? null;
}

async function ensureStagingTables() {
  const { error } = await supabase.from('legacy_stamps').select('id').limit(1);
  if (error) {
    console.error(
      'legacy_stamps 테이블이 없습니다. SQL Editor에서 016_legacy_firebase_staging.sql 을 먼저 실행하세요.\n',
      error.message
    );
    process.exit(1);
  }
}

async function upsertStaging(table, row) {
  if (dryRun) return { error: null };
  return supabase.from(table).upsert(row, { onConflict: 'legacy_uuid,firestore_id' });
}

async function applyPendingForProfile(legacyUuid, profileId) {
  if (dryRun || !profileId) return { stamps: 0, coupons: 0, history: 0 };
  const now = new Date().toISOString();
  const counts = { stamps: 0, coupons: 0, history: 0 };

  const { data: stamps } = await supabase
    .from('legacy_stamps')
    .select('id, date, method, created_at')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null);

  for (const row of stamps ?? []) {
    const { error } = await supabase.from('stamps').insert({
      user_id: profileId,
      date: row.date,
      method: row.method || 'QR',
      created_at: row.created_at || now,
    });
    if (!error) {
      await supabase
        .from('legacy_stamps')
        .update({ applied_profile_id: profileId, applied_at: now })
        .eq('id', row.id);
      counts.stamps += 1;
    }
  }

  const { data: coupons } = await supabase
    .from('legacy_coupons')
    .select('id, reason, is_half, used, used_at, issued_at, deleted, created_at')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null);

  for (const row of coupons ?? []) {
    if (row.deleted) {
      await supabase
        .from('legacy_coupons')
        .update({ applied_profile_id: profileId, applied_at: now })
        .eq('id', row.id);
      continue;
    }
    const { error } = await supabase.from('coupons').insert({
      user_id: profileId,
      reason: row.reason,
      is_half: Boolean(row.is_half),
      used: Boolean(row.used),
      used_at: row.used_at,
      issued_at: row.issued_at,
      created_at: row.created_at || now,
    });
    if (!error) {
      await supabase
        .from('legacy_coupons')
        .update({ applied_profile_id: profileId, applied_at: now })
        .eq('id', row.id);
      counts.coupons += 1;
    }
  }

  const { data: history } = await supabase
    .from('legacy_stamp_history')
    .select('id, action, date, method, message, created_at')
    .eq('legacy_uuid', legacyUuid)
    .is('applied_profile_id', null);

  for (const row of history ?? []) {
    const { error } = await supabase.from('stamp_history').insert({
      user_id: profileId,
      stamp_id: null,
      action: row.action,
      date: row.date,
      method: row.method,
      message: row.message,
      created_at: row.created_at || now,
    });
    if (!error) {
      await supabase
        .from('legacy_stamp_history')
        .update({ applied_profile_id: profileId, applied_at: now })
        .eq('id', row.id);
      counts.history += 1;
    }
  }

  return counts;
}

async function importUser(legacyUuid, userData) {
  const stats = {
    stamps: 0,
    coupons: 0,
    history: 0,
    applied: { stamps: 0, coupons: 0, history: 0 },
    errors: 0,
  };

  const stampsSnap = await getDocs(collection(db, 'users', legacyUuid, 'stamps'));
  for (const d of stampsSnap.docs) {
    const data = d.data();
    const row = {
      legacy_uuid: legacyUuid,
      firestore_id: d.id,
      date: data.date ?? null,
      method: data.method || 'QR',
      created_at: toIso(data.timestamp) || toIso(data.createdAt),
    };
    const { error } = await upsertStaging('legacy_stamps', row);
    if (error) {
      console.error(`stamp ${legacyUuid}/${d.id}:`, error.message);
      stats.errors += 1;
    } else {
      stats.stamps += 1;
    }
  }

  const couponsSnap = await getDocs(collection(db, 'users', legacyUuid, 'coupons'));
  for (const d of couponsSnap.docs) {
    const data = d.data();
    const row = {
      legacy_uuid: legacyUuid,
      firestore_id: d.id,
      reason: data.reason ?? null,
      is_half: isHalfBool(data.isHalf),
      used: Boolean(data.used),
      used_at: toIso(data.usedAt),
      issued_at: issuedAtToText(data.issuedAt),
      deleted: Boolean(data.deleted),
      created_at: toIso(data.issuedAt) || toIso(data.createdAt),
    };
    const { error } = await upsertStaging('legacy_coupons', row);
    if (error) {
      console.error(`coupon ${legacyUuid}/${d.id}:`, error.message);
      stats.errors += 1;
    } else {
      stats.coupons += 1;
    }
  }

  const historySnap = await getDocs(collection(db, 'users', legacyUuid, 'stampHistory'));
  for (const d of historySnap.docs) {
    const data = d.data();
    const row = {
      legacy_uuid: legacyUuid,
      firestore_id: d.id,
      action: data.action || 'add',
      stamp_firestore_id: data.stampId ?? null,
      date: data.date ?? null,
      method: data.method ?? null,
      message: data.message ?? null,
      created_at: toIso(data.timestamp),
    };
    const { error } = await upsertStaging('legacy_stamp_history', row);
    if (error) {
      console.error(`history ${legacyUuid}/${d.id}:`, error.message);
      stats.errors += 1;
    } else {
      stats.history += 1;
    }
  }

  // 프로필 메타(선택): lastStampTime / baitCoupons
  if (!dryRun) {
    const profileId = await resolveProfileId(legacyUuid);
    if (profileId) {
      const patch = {};
      const last = toIso(userData.lastStampTime);
      if (last) patch.last_stamp_time = last;
      if (typeof userData.baitCoupons === 'number') patch.bait_coupons = userData.baitCoupons;
      if (Object.keys(patch).length) {
        await supabase.from('profiles').update(patch).eq('id', profileId);
      }
      stats.applied = await applyPendingForProfile(legacyUuid, profileId);
    }
  }

  return stats;
}

async function main() {
  if (!dryRun && !cutover) {
    console.error(`
구앱 사용자가 남아 있으면 이 스크립트를 실행하지 마세요.
Firestore baitCoupons 를 지금 profiles.bait_coupons 로 복사하면
구앱과 신앱 미끼 잔액이 갈라집니다.

dry-run:  npm run import:firebase-stamps -- --dry-run
실기록은 전원 신앱 이후:  npm run import:firebase-stamps -- --cutover
`);
    process.exit(1);
  }

  console.log(
    [
      'Firebase → Supabase stamps/coupons import',
      dryRun ? '[DRY-RUN]' : '[WRITE]',
      limit != null && !Number.isNaN(limit) ? `limit=${limit}` : 'limit=all',
      onlyLegacyUuid ? `uuid=${onlyLegacyUuid}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
  console.log('Auth UX: 이름+생년월일 로그인, 미연결 게스트는 관리자 수동 연결');
  console.log('FK strategy: staging(legacy_*) → merge/apply → live tables\n');

  if (!dryRun) await ensureStagingTables();

  let userDocs;
  if (onlyLegacyUuid) {
    const snap = await getDoc(doc(db, 'users', onlyLegacyUuid));
    if (!snap.exists()) {
      console.error('해당 users 문서 없음:', onlyLegacyUuid);
      process.exit(1);
    }
    userDocs = [snap];
  } else {
    const snapshot = await getDocs(collection(db, 'users'));
    userDocs = snapshot.docs;
  }

  if (limit != null && !Number.isNaN(limit)) {
    userDocs = userDocs.slice(0, limit);
  }

  let users = 0;
  let totalStamps = 0;
  let totalCoupons = 0;
  let totalHistory = 0;
  let totalApplied = 0;
  let errors = 0;

  for (const userDoc of userDocs) {
    const legacyUuid = userDoc.id;
    const userData = userDoc.data();
    const stats = await importUser(legacyUuid, userData);
    users += 1;
    totalStamps += stats.stamps;
    totalCoupons += stats.coupons;
    totalHistory += stats.history;
    totalApplied += stats.applied.stamps + stats.applied.coupons + stats.applied.history;
    errors += stats.errors;
    console.log(
      `${dryRun ? 'would-import' : 'imported'}: ${userData.name || '?'} (${legacyUuid}) ` +
        `stamps=${stats.stamps} coupons=${stats.coupons} history=${stats.history}` +
        (stats.applied.stamps + stats.applied.coupons + stats.applied.history
          ? ` applied=${JSON.stringify(stats.applied)}`
          : ' (staging only)')
    );
  }

  console.log('\n── 요약 ──');
  console.log(`users: ${users}`);
  console.log(`stamps rows: ${totalStamps}`);
  console.log(`coupons rows: ${totalCoupons}`);
  console.log(`history rows: ${totalHistory}`);
  console.log(`live applied rows: ${totalApplied}`);
  console.log(`errors: ${errors}`);
  if (dryRun) {
    console.log('\nDRY-RUN 완료. 실제 적재: npm run import:firebase-stamps -- --limit 5');
  } else {
    console.log('\n미연결 회원은 staging만 적재됨. 이름·생년월일 로그인 또는 관리자 게스트 연결 시 live로 이동.');
    console.log('전량 이관 후 구앱(Firebase) 쓰기를 중단하세요. 자세한 내용: scripts/FIREBASE_MIGRATION.md');
  }

  // migration SQL path hint for operators
  try {
    readFileSync(resolve(process.cwd(), 'supabase/migrations/016_legacy_firebase_staging.sql'));
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
