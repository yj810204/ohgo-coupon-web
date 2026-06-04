#!/usr/bin/env node
/**
 * Firebase uuidv5 회원 → Supabase guest_profiles 일괄 import
 *
 * 사용법:
 *   node scripts/import-firebase-guests.mjs
 *
 * 필요 env (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   (Firebase 클라이언트 env — lib/firebase.ts 와 동일)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });

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

async function main() {
  const snapshot = await getDocs(collection(db, 'users'));
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const userDoc of snapshot.docs) {
    const legacyUuid = userDoc.id;
    const userData = userDoc.data();

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('legacy_uuid', legacyUuid)
      .maybeSingle();

    if (existingProfile) {
      skipped++;
      continue;
    }

    const { data: existingGuest } = await supabase
      .from('guest_profiles')
      .select('id, merged_to')
      .eq('id', legacyUuid)
      .maybeSingle();

    if (existingGuest?.merged_to) {
      skipped++;
      continue;
    }

    const { error: guestError } = await supabase.from('guest_profiles').upsert(
      {
        id: legacyUuid,
        name: userData.name ?? '',
        dob: userData.dob ?? '',
        phone: userData.phone ?? null,
      },
      { onConflict: 'id' }
    );

    if (guestError) {
      console.error(`guest ${legacyUuid}:`, guestError.message);
      errors++;
      continue;
    }

    const boardingSnap = await getDoc(doc(db, 'users', legacyUuid, 'boarding', 'info'));
    if (boardingSnap.exists()) {
      const b = boardingSnap.data();
      const { error: boardingError } = await supabase.from('guest_boarding_info').upsert(
        {
          guest_id: legacyUuid,
          name: b.name,
          birth: b.birth,
          gender: b.gender,
          phone: b.phone,
          emergency: b.emergency,
          address: b.address,
          address_detail: b.addressDetail ?? null,
          agreed: Boolean(b.agreed),
          agreed_third_party: Boolean(b.agreedThirdParty),
          trip_role: b.role ?? b.tripRole ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'guest_id' }
      );
      if (boardingError) {
        console.error(`boarding ${legacyUuid}:`, boardingError.message);
        errors++;
        continue;
      }
    }

    imported++;
    console.log(`imported: ${userData.name} (${legacyUuid})`);
  }

  console.log(`\n완료 — import: ${imported}, skip: ${skipped}, errors: ${errors}`);
  console.log('OAuth 가입 후 profile-setup에서 이름+생년월일 입력 시 자동 병합됩니다.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
