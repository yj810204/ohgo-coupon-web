#!/usr/bin/env node
/**
 * 승선기록 원장(boardingLedger)을 과거 기록으로 채운다.
 * 근거 순서: 명부 이미지 OCR > 출항 확정 명단(대조용) > tripCredited 표시 > 스탬프(추정, 검토 필요).
 *
 * 기본은 운영 Firestore 를 읽기만 하고 reports/ 에 보고서를 만든다.
 *   node scripts/build-boarding-ledger.mjs
 *   node scripts/build-boarding-ledger.mjs --from 2026-09-01 --to 2026-09-30
 *   node scripts/build-boarding-ledger.mjs --write                    # 원장 두 컬렉션에만 쓴다
 *   node scripts/build-boarding-ledger.mjs --sync-tripcount           # 승선 횟수 변경 목록만
 *   node scripts/build-boarding-ledger.mjs --sync-tripcount --write   # users.tripCount 를 원장에 맞춘다
 *
 * OCR 언어 데이터는 .cache/tesseract 에 kor/eng.traineddata 를 둔다 (커밋하지 않음).
 */

import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp } from 'firebase/app';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { followMergedToChain } from '../lib/firebase/merged-to.ts';
import {
  LEDGER_COLLECTION,
  LEDGER_TRIPS_COLLECTION,
  buildMatchIndex,
  compareWithConfirmed,
  guestPersonKey,
  isCounted,
  isDateInRange,
  ledgerDocId,
  matchRosterRow,
  mergeEntry,
  planTripCountSync,
  toCsv,
  tripDocId,
} from '../lib/boarding-ledger.shared.ts';
import { recognizeRosterTable } from './roster-image-rows.mjs';

config({ path: resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const flagValue = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};

const write = flag('--write');
const syncTripCount = flag('--sync-tripcount');
const range = { startDate: flagValue('--from', '2000-01-01'), endDate: flagValue('--to', '2999-12-31') };
const cacheDir = resolve(process.cwd(), '.cache');
const ocrCacheDir = resolve(cacheDir, 'ocr');
const langDir = resolve(cacheDir, 'tesseract');
const reportDir = resolve(process.cwd(), 'reports');
const runAt = new Date();
const runStamp = runAt.toISOString().slice(0, 19).replace(/[:T]/g, '-');
const ACTOR = 'backfill-script';

const db = getFirestore(
  initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  })
);

function kstDate(value) {
  let d = null;
  if (value && typeof value.toDate === 'function') d = value.toDate();
  else if (value && typeof value.seconds === 'number') d = new Date(value.seconds * 1000);
  else if (typeof value === 'string' || typeof value === 'number') d = new Date(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

function stampDate(data) {
  return kstDate(data.timestamp) ?? (/^\d{4}-\d{2}-\d{2}$/.test(String(data.date ?? '')) ? data.date : null);
}

function createdMillis(v) {
  if (!v) return Number.POSITIVE_INFINITY;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

async function loadUsers() {
  const snap = await getDocs(collection(db, 'users'));
  const docs = {};
  for (const d of snap.docs) docs[d.id] = d.data();
  const boardingInfo = {};
  try {
    const bSnap = await getDocs(collectionGroup(db, 'boarding'));
    for (const d of bSnap.docs) {
      if (d.id !== 'info') continue;
      boardingInfo[d.ref.parent.parent.id] = d.data();
    }
  } catch (e) {
    console.warn('boarding/info 읽기 실패, 회원 정보만으로 매칭:', e.code || e.message);
  }
  return { docs, boardingInfo };
}

function makeResolver(docs) {
  const hopDocs = {};
  for (const [id, data] of Object.entries(docs)) hopDocs[id] = { mergedTo: data.mergedTo ?? null };
  const cache = new Map();
  return (id) => {
    if (!cache.has(id)) cache.set(id, followMergedToChain(id, hopDocs).id || id);
    return cache.get(id);
  };
}

async function loadStamps(resolveId) {
  const byUserDate = new Map();
  const add = (userId, date, stampId) => {
    if (!date) return;
    const key = `${resolveId(userId)}|${date}`;
    const set = byUserDate.get(key) ?? new Set();
    set.add(stampId);
    byUserDate.set(key, set);
  };
  const [history, stamps] = await Promise.all([
    getDocs(collectionGroup(db, 'stampHistory')),
    getDocs(collectionGroup(db, 'stamps')),
  ]);
  const recalled = new Set();
  for (const d of history.docs) {
    const data = d.data();
    if (data.action === 'recall') recalled.add(String(data.stampId ?? ''));
  }
  for (const d of history.docs) {
    const data = d.data();
    if (data.action !== 'add') continue;
    if (d.ref.parent.parent?.parent?.id !== 'users') continue;
    const stampId = String(data.stampId ?? d.id);
    if (recalled.has(stampId)) continue;
    add(d.ref.parent.parent.id, stampDate(data), stampId);
  }
  for (const d of stamps.docs) {
    if (d.ref.parent.parent?.parent?.id !== 'users') continue;
    add(d.ref.parent.parent.id, stampDate(d.data()), d.id);
  }
  return byUserDate;
}

function tripCreditedDates(docs, resolveId) {
  const out = new Set();
  for (const [id, data] of Object.entries(docs)) {
    for (const [key, value] of Object.entries(data)) {
      const m = /^tripCredited_(\d{4}-\d{2}-\d{2})_(\d+)$/.exec(key);
      if (!m || !(value === true || value === 'true' || value === 1)) continue;
      out.add(`${resolveId(id)}|${m[1]}|${m[2]}`);
    }
  }
  return out;
}

async function ocrTrip(worker, date, tripNumber, url) {
  const cacheFile = resolve(ocrCacheDir, `${date}_${tripNumber}.json`);
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (cached.url === url) return cached;
  }
  let result;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const rows = await recognizeRosterTable(worker, buf);
    result = { url, status: rows.length ? 'ok' : 'failed', rows };
  } catch (e) {
    result = { url, status: 'failed', rows: [], error: String(e.message || e) };
  }
  writeFileSync(cacheFile, JSON.stringify(result));
  return result;
}

function newEntry(p) {
  return {
    id: ledgerDocId(p.date, p.tripNumber, p.personKey),
    userId: null,
    name: '',
    birth: '',
    role: 'passenger',
    status: 'matched',
    sources: [],
    matchMethod: 'none',
    needsReview: false,
    evidence: {},
    createdBy: ACTOR,
    ...p,
  };
}

async function main() {
  mkdirSync(ocrCacheDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });

  console.log('회원·명부·스탬프 읽는 중…');
  const [{ docs, boardingInfo }, tripsSnap, attendanceSnap, existingSnap, existingTripsSnap] = await Promise.all([
    loadUsers(),
    getDocs(collection(db, 'trips')),
    getDocs(collection(db, 'attendance')),
    getDocs(collection(db, LEDGER_COLLECTION)),
    getDocs(collection(db, LEDGER_TRIPS_COLLECTION)),
  ]);
  const existingTrips = new Set(existingTripsSnap.docs.map((d) => d.id));
  const resolveId = makeResolver(docs);
  const stampsByUserDate = await loadStamps(resolveId);
  const credited = tripCreditedDates(docs, resolveId);
  const crewIds = new Set(
    Object.entries(docs)
      .filter(([, d]) => d.role === 'captain' || d.role === 'sailor')
      .map(([id]) => resolveId(id))
  );
  const existing = new Map(existingSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const candidates = [];
  for (const [id, data] of Object.entries(docs)) {
    if (data.mergedTo) continue;
    candidates.push({ userId: id, name: data.name, birth: data.dob, created: createdMillis(data.createdAt) });
    const info = boardingInfo[id];
    if (info) {
      candidates.push({ userId: id, name: info.name, birth: info.birth, created: createdMillis(data.createdAt) });
      candidates.push({ userId: id, name: info.name, birth: data.dob, created: createdMillis(data.createdAt) });
    }
  }
  candidates.sort((a, b) => a.created - b.created || a.userId.localeCompare(b.userId));
  const index = buildMatchIndex(candidates);
  const nameOf = (id) => String(docs[id]?.name ?? '').trim();
  const birthOf = (id) => String(docs[id]?.dob ?? boardingInfo[id]?.birth ?? '');

  const attendance = new Map(attendanceSnap.docs.map((d) => [d.id, d.data()]));
  const targets = [];
  const confirmedDates = new Map();
  for (const d of tripsSnap.docs) {
    if (!isDateInRange(d.id, range)) continue;
    for (let n = 1; n <= 3; n += 1) {
      const t = d.data()[`trip${n}`];
      if (!t?.confirmed) continue;
      targets.push({ date: d.id, tripNumber: n, url: t.rosterImageUrl ? String(t.rosterImageUrl) : '' });
      confirmedDates.set(d.id, [...(confirmedDates.get(d.id) ?? []), n]);
    }
  }
  targets.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.tripNumber - b.tripNumber));
  const limit = Number(flagValue('--limit', '0'));
  if (limit > 0) targets.splice(limit);
  console.log(`대상 항차 ${targets.length}건 (명부 이미지 ${targets.filter((t) => t.url).length}건)`);

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('kor+eng', 1, { cachePath: langDir, langPath: langDir, gzip: false });

  const entries = new Map();
  const tripSummaries = [];
  const unmatchedRows = [];
  const put = (e) => entries.set(e.id, mergeEntry(entries.get(e.id), e));

  try {
    let i = 0;
    for (const t of targets) {
      i += 1;
      const ocr = t.url ? await ocrTrip(worker, t.date, t.tripNumber, t.url) : { status: 'none', rows: [] };
      const confirmedRaw = attendance.get(t.date)?.confirmedMembers?.[String(t.tripNumber)];
      const confirmedIds = [...new Set((Array.isArray(confirmedRaw) ? confirmedRaw : []).map(String).map(resolveId))];
      const confirmedCandidates = confirmedIds.map((id) => ({ userId: id, name: nameOf(id), birth: birthOf(id) }));

      const tripEntryIds = [];
      for (const row of ocr.rows) {
        const m = matchRosterRow(row, index, confirmedCandidates, resolveId);
        const personKey = m.userId ?? guestPersonKey(row.name, row.birth);
        const e = newEntry({
          date: t.date,
          tripNumber: t.tripNumber,
          personKey,
          userId: m.userId,
          name: m.userId ? nameOf(m.userId) || row.name : row.name,
          birth: m.userId ? birthOf(m.userId) || row.birth : row.birth,
          role: m.userId && crewIds.has(m.userId) ? 'crew' : 'passenger',
          status: m.userId ? 'matched' : 'unmatched',
          sources: ['ROSTER_IMAGE'],
          matchMethod: m.method,
          needsReview: m.needsReview,
          evidence: { rosterImageUrl: t.url, ocrName: row.name, ocrBirth: row.birth },
        });
        put(e);
        tripEntryIds.push(e.id);
        if (!m.userId || m.needsReview) {
          unmatchedRows.push({ date: t.date, trip: t.tripNumber, ocrName: row.name, ocrBirth: row.birth, method: m.method, userId: m.userId ?? '', name: m.userId ? nameOf(m.userId) : '' });
        }
      }

      if (ocr.status !== 'ok') {
        for (const id of confirmedIds) {
          const e = newEntry({
            date: t.date,
            tripNumber: t.tripNumber,
            personKey: id,
            userId: id,
            name: nameOf(id),
            birth: birthOf(id),
            role: crewIds.has(id) ? 'crew' : 'passenger',
            sources: ['CONFIRM'],
            matchMethod: 'confirm',
            needsReview: true,
            evidence: t.url ? { rosterImageUrl: t.url } : {},
          });
          put(e);
          tripEntryIds.push(e.id);
        }
      }

      for (const id of tripEntryIds) {
        const e = entries.get(id);
        if (!e.userId) continue;
        if (confirmedIds.includes(e.userId) && !e.sources.includes('CONFIRM')) put({ ...e, sources: ['CONFIRM'] });
        if (credited.has(`${e.userId}|${t.date}|${t.tripNumber}`)) put({ ...entries.get(id), sources: ['TRIP_CREDITED'] });
        const stampIds = stampsByUserDate.get(`${e.userId}|${t.date}`);
        if (stampIds) put({ ...entries.get(id), sources: ['STAMP'], evidence: { stampIds: [...stampIds] } });
      }

      const tripEntries = tripEntryIds.map((id) => entries.get(id));
      const ledgerUserIds = tripEntries.filter((e) => e.userId).map((e) => e.userId);
      const diff = compareWithConfirmed(ledgerUserIds, confirmedIds);
      tripSummaries.push({
        id: tripDocId(t.date, t.tripNumber),
        date: t.date,
        tripNumber: t.tripNumber,
        rosterImageUrl: t.url,
        ocrStatus: ocr.status,
        matched: tripEntries.filter((e) => e.userId && e.role === 'passenger').length,
        unmatched: tripEntries.filter((e) => !e.userId).length,
        crew: tripEntries.filter((e) => e.role === 'crew').length,
        onlyInConfirmed: diff.onlyInConfirmed,
        onlyInLedger: ocr.status === 'ok' && confirmedIds.length ? diff.onlyInLedger : [],
        needsReview: tripEntries.filter((e) => e.needsReview).length + diff.onlyInConfirmed.length,
        reviewed: false,
      });
      if (i % 10 === 0 || i === targets.length) console.log(`  ${i}/${targets.length} ${t.date} ${t.tripNumber}항차 OCR ${ocr.rows.length}줄`);
    }
  } finally {
    await worker.terminate();
  }

  // 명부에는 없는데 그날 스탬프가 있는 회원: 추정 행 (검토 전에는 집계에서 뺀다)
  const onLedgerByDate = new Set([...entries.values()].filter((e) => e.userId).map((e) => `${e.userId}|${e.date}`));
  const stampOnly = [];
  for (const [key, stampIds] of stampsByUserDate) {
    const [userId, date] = key.split('|');
    if (!isDateInRange(date, range) || onLedgerByDate.has(key) || crewIds.has(userId)) continue;
    if (!docs[userId] || docs[userId].mergedTo) continue;
    const trips = confirmedDates.get(date) ?? [];
    const tripNumber = trips.length === 1 ? trips[0] : 1;
    const e = newEntry({
      date,
      tripNumber,
      personKey: userId,
      userId,
      name: nameOf(userId),
      birth: birthOf(userId),
      sources: ['STAMP'],
      matchMethod: 'none',
      needsReview: true,
      evidence: { stampIds: [...stampIds] },
    });
    put(e);
    stampOnly.push({ date, tripNumber, userId, name: nameOf(userId), confirmedTrips: trips.join('/') || '확정 없음', stamps: stampIds.size });
  }

  // 이미 원장에 있던 행(사람이 검토한 것 포함)과 합친다
  const finalEntries = [...entries.values()].map((e) => mergeEntry(existing.get(e.id), e));
  const allEntries = new Map(existing);
  for (const e of finalEntries) allEntries.set(e.id, e);

  const current = new Map(
    Object.entries(docs)
      .filter(([, d]) => !d.mergedTo)
      .map(([id, d]) => [id, { tripCount: Number(d.tripCount) || 0, name: String(d.name ?? '') }])
  );
  const tripCountChanges = planTripCountSync([...allEntries.values()], current);

  // 월별 근거 분포
  const monthly = {};
  for (const s of tripSummaries) {
    const m = s.date.slice(0, 7);
    monthly[m] ??= { 항차: 0, 이미지OCR성공: 0, OCR실패: 0, 매칭: 0, 미매칭: 0, 확정명단에만: 0, 검토필요: 0 };
    monthly[m].항차 += 1;
    if (s.ocrStatus === 'ok') monthly[m].이미지OCR성공 += 1;
    else monthly[m].OCR실패 += 1;
    monthly[m].매칭 += s.matched;
    monthly[m].미매칭 += s.unmatched;
    monthly[m].확정명단에만 += s.onlyInConfirmed.length;
    monthly[m].검토필요 += s.needsReview;
  }

  const base = resolve(reportDir, `boarding-ledger-${runStamp}`);
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ runAt, range, monthly, tripSummaries, unmatchedRows, stampOnly, tripCountChanges, entries: finalEntries }, null, 1)
  );
  writeFileSync(
    `${base}-trips.csv`,
    toCsv([
      ['날짜', '항차', 'OCR', '매칭', '미매칭', '선장·선원', '확정명단에만', '검토필요'],
      ...tripSummaries.map((s) => [
        s.date,
        s.tripNumber,
        s.ocrStatus,
        s.matched,
        s.unmatched,
        s.crew,
        s.onlyInConfirmed.map(nameOf).join(' '),
        s.needsReview,
      ]),
    ])
  );
  writeFileSync(
    `${base}-unmatched.csv`,
    toCsv([
      ['날짜', '항차', 'OCR 이름', 'OCR 생년월일', '매칭 방법', '맞춘 회원'],
      ...unmatchedRows.map((r) => [r.date, r.trip, r.ocrName, r.ocrBirth, r.method, r.name]),
    ])
  );
  writeFileSync(
    `${base}-stamp-only.csv`,
    toCsv([['날짜', '항차(추정)', '회원', '그날 확정 항차', '스탬프 수'], ...stampOnly.map((r) => [r.date, r.tripNumber, r.name, r.confirmedTrips, r.stamps])])
  );
  writeFileSync(
    `${base}-tripcount.csv`,
    toCsv([['회원', '현재 tripCount', '원장 기준', '차이'], ...tripCountChanges.map((c) => [c.name, c.from, c.to, c.to - c.from])])
  );

  console.log('\n월별 근거 분포');
  console.table(monthly);
  const counted = finalEntries.filter(isCounted);
  console.log(`원장 행 ${finalEntries.length}건 (집계 대상 ${counted.length}, 비회원·미매칭 ${finalEntries.filter((e) => !e.userId).length}, 스탬프 추정 ${stampOnly.length})`);
  console.log(`승선 횟수가 바뀌는 회원 ${tripCountChanges.length}명`);
  console.log(`보고서: ${base}.json 외 CSV 4개`);

  if (!write) {
    console.log('\n확인만 했습니다. 원장에 쓰려면 --write');
    return;
  }

  if (syncTripCount) {
    let n = 0;
    for (let k = 0; k < tripCountChanges.length; k += 400) {
      const batch = writeBatch(db);
      for (const c of tripCountChanges.slice(k, k + 400)) {
        batch.update(doc(db, 'users', c.userId), { tripCount: c.to, tripCountSyncedAt: serverTimestamp() });
        n += 1;
      }
      await batch.commit();
    }
    console.log(`users.tripCount ${n}명 동기화`);
    return;
  }

  let written = 0;
  for (let k = 0; k < finalEntries.length; k += 400) {
    const batch = writeBatch(db);
    for (const e of finalEntries.slice(k, k + 400)) {
      const { id, ...data } = e;
      batch.set(
        doc(db, LEDGER_COLLECTION, id),
        { ...data, updatedAt: serverTimestamp(), ...(existing.has(id) ? {} : { createdAt: serverTimestamp() }) },
        { merge: true }
      );
      written += 1;
    }
    await batch.commit();
  }
  for (let k = 0; k < tripSummaries.length; k += 400) {
    const batch = writeBatch(db);
    for (const s of tripSummaries.slice(k, k + 400)) {
      const { id, reviewed, ...data } = s;
      batch.set(
        doc(db, LEDGER_TRIPS_COLLECTION, id),
        { ...data, ...(existingTrips.has(id) ? {} : { reviewed }), updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
    await batch.commit();
  }
  console.log(`원장 ${written}건, 항차 요약 ${tripSummaries.length}건 저장`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
