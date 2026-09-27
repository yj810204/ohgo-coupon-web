#!/usr/bin/env node
/**
 * 명부 이미지가 있는 항차의 성명·생년월일을 읽어 attendance.confirmedMembers 에 넣는다.
 * 이미 회원 목록이 있는 항차(8월 22일 이후 포함)도 대상이다.
 * 기존 회원 아이디는 유지하고, 이미지에서 새로 맞은 회원만 더한다.
 *
 * 기본은 대상 건수와 읽을 결과만 출력한다. 저장은 --write 가 있을 때만 한다.
 *
 *   node scripts/backfill-roster-image-members.mjs
 *   node scripts/backfill-roster-image-members.mjs --write
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from 'firebase/firestore';
import { createWorker } from 'tesseract.js';
import { personIdentityKey, recognizeRosterRows } from './roster-image-rows.mjs';

config({ path: resolve(process.cwd(), '.env.local') });

const write = process.argv.includes('--write');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('Firebase env 설정 필요');
  process.exit(1);
}

const db = getFirestore(initializeApp(firebaseConfig));

function createdAtMillis(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  }
  if (typeof value.toDate === 'function') {
    const time = value.toDate().getTime();
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return Number.POSITIVE_INFINITY;
}

function addMemberKey(index, name, dob, userDoc) {
  const key = personIdentityKey(name, dob);
  if (key.startsWith('|') || key.endsWith('|')) return;
  const list = index.get(key) ?? [];
  if (!list.some((item) => item.id === userDoc.id)) {
    list.push({ id: userDoc.id, createdAt: createdAtMillis(userDoc.data().createdAt) });
  }
  index.set(key, list);
}

function chooseMemberId(matches) {
  const [first] = [...matches].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  );
  return first?.id ?? null;
}

async function memberIndex(db, users) {
  const index = new Map();
  const active = users.filter((userDoc) => !userDoc.data().mergedTo);
  for (const userDoc of active) {
    const data = userDoc.data();
    addMemberKey(index, data.name, data.dob, userDoc);
  }

  for (let i = 0; i < active.length; i += 40) {
    const part = active.slice(i, i + 40);
    const boardingSnaps = await Promise.all(
      part.map((userDoc) => getDoc(doc(db, 'users', userDoc.id, 'boarding', 'info')))
    );
    boardingSnaps.forEach((snap, indexInPart) => {
      if (!snap.exists()) return;
      const boarding = snap.data();
      const user = part[indexInPart].data();
      addMemberKey(index, boarding.name, boarding.birth, part[indexInPart]);
      addMemberKey(index, boarding.name, user.dob, part[indexInPart]);
    });
  }
  return index;
}

function tripImages(data) {
  const images = [];
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!value || typeof value !== 'object' || !value.rosterImageUrl) continue;
    if (!key.startsWith('trip')) continue;
    const tripNumber = Number(key.slice(4));
    if (!Number.isFinite(tripNumber)) continue;
    images.push({ tripNumber, url: String(value.rosterImageUrl) });
  }
  return images;
}

async function main() {
  const [tripSnap, userSnap] = await Promise.all([
    getDocs(collection(db, 'trips')),
    getDocs(collection(db, 'users')),
  ]);
  const users = await memberIndex(db, userSnap.docs);
  const targets = [];

  for (const tripDoc of tripSnap.docs) {
    const attendanceSnap = await getDoc(doc(db, 'attendance', tripDoc.id));
    const confirmed = attendanceSnap.exists() ? attendanceSnap.data().confirmedMembers ?? {} : {};
    for (const image of tripImages(tripDoc.data())) {
      const existing = confirmed?.[String(image.tripNumber)];
      const existingIds = Array.isArray(existing) ? existing.map(String) : [];
      targets.push({ date: tripDoc.id, existingIds, ...image });
    }
  }

  console.log(`대상 ${targets.length}건`);
  if (targets.length === 0) return;

  const worker = await createWorker('kor+eng');
  let written = 0;
  let skipped = 0;

  try {
    for (const target of targets) {
      const response = await fetch(target.url);
      if (!response.ok) {
        skipped += 1;
        console.log(`${target.date} ${target.tripNumber}항차 이미지 다운로드 실패`);
        continue;
      }
      const buf = Buffer.from(await response.arrayBuffer());
      const rows = await recognizeRosterRows(worker, buf);
      const memberIds = [...target.existingIds];
      for (const row of rows) {
        if (!row.birth) {
          console.log(`${target.date} ${target.tripNumber}항차 생년월일 미인식: ${row.name}`);
          continue;
        }
        const matches = users.get(personIdentityKey(row.name, row.birth)) ?? [];
        const memberId = chooseMemberId(matches);
        if (!memberId) {
          console.log(
            `${target.date} ${target.tripNumber}항차 회원 불일치: ${row.name} ${row.birth} (0건)`
          );
          continue;
        }
        if (matches.length > 1) {
          console.log(
            `${target.date} ${target.tripNumber}항차 같은 사람 ${matches.length}건 → 가입일이 이른 계정: ${row.name} ${row.birth}`
          );
        }
        if (!memberIds.includes(memberId)) memberIds.push(memberId);
      }

      if (memberIds.length === 0) {
        skipped += 1;
        console.log(`${target.date} ${target.tripNumber}항차 기록할 회원 없음`);
        continue;
      }

      const added = memberIds.length - target.existingIds.length;
      const kept =
        target.existingIds.length > 0 ? ` (기존 ${target.existingIds.length}명, 추가 ${added}명)` : '';
      console.log(`${target.date} ${target.tripNumber}항차 ${memberIds.length}명${kept}${write ? '' : ' (미저장)'}`);
      if (!write || added === 0) continue;

      const attendanceRef = doc(db, 'attendance', target.date);
      const attendanceSnap = await getDoc(attendanceRef);
      const prev =
        attendanceSnap.exists() && attendanceSnap.data().confirmedMembers
          ? attendanceSnap.data().confirmedMembers
          : {};
      await setDoc(
        attendanceRef,
        { confirmedMembers: { ...prev, [String(target.tripNumber)]: memberIds } },
        { merge: true }
      );
      written += 1;
    }
  } finally {
    await worker.terminate();
  }

  console.log(write ? `저장 ${written}건, 건너뜀 ${skipped}건` : `확인만. 저장하려면 --write`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
