import assert from 'node:assert/strict';
import fallback from './kr-holidays-fallback.json' with { type: 'json' };
import {
  fetchKasiHolidays,
  getHolidayYear,
  needsKasiRefresh,
  parseKasiRestDeResponse,
  resetHolidayMemo,
  type HolidayStore,
  type StoredHolidayYear,
} from './kasi-holidays.ts';
import { holidaysToMap, mergeHolidays, shortHolidayName } from './kr-holidays.ts';

type Row = { date: string; name: string };
const data = fallback as Record<string, Row[]>;

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

// fallback JSON: 연도, 정렬, 중복, 가운뎃점
assert.deepEqual(Object.keys(data).sort(), ['2025', '2026', '2027']);
for (const [year, rows] of Object.entries(data)) {
  const dates = rows.map((r) => r.date);
  assert.deepEqual(dates, [...dates].sort(), `${year} 정렬`);
  assert.equal(new Set(dates).size, dates.length, `${year} 중복 날짜`);
  for (const r of rows) {
    assert.ok(r.date.startsWith(`${year}-`), r.date);
    assert.ok(!Number.isNaN(Date.parse(r.date)), r.date);
    assert.ok(!r.name.includes('\u00B7'), `가운뎃점 금지: ${r.name}`);
  }
  // 대체공휴일은 평일이고 바로 앞에 주말이나 공휴일이 있어야 한다
  const holidaySet = new Set(dates);
  for (const r of rows.filter((x) => x.name.startsWith('대체공휴일'))) {
    const wd = weekday(r.date);
    assert.ok(wd !== 0 && wd !== 6, `대체공휴일 평일: ${r.date}`);
    const prev = new Date(`${r.date}T12:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const prevStr = prev.toISOString().slice(0, 10);
    assert.ok(holidaySet.has(prevStr) || weekday(prevStr) === 0, `대체공휴일 직전: ${r.date}`);
  }
}

const map = holidaysToMap(Object.values(data).flat());
const expectNames: Record<string, string> = {
  '2025-01-27': '임시공휴일',
  '2025-01-28': '설날',
  '2025-01-29': '설날',
  '2025-01-30': '설날',
  '2025-03-03': '대체공휴일(삼일절)',
  '2025-05-05': '어린이날, 부처님오신날',
  '2025-05-06': '대체공휴일(어린이날)',
  '2025-06-03': '대통령선거',
  '2025-10-05': '추석',
  '2025-10-06': '추석',
  '2025-10-07': '추석',
  '2025-10-08': '대체공휴일(추석)',
  '2026-02-16': '설날',
  '2026-02-17': '설날',
  '2026-02-18': '설날',
  '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-01': '노동절',
  '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '전국동시지방선거',
  '2026-07-17': '제헌절',
  '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석',
  '2026-09-25': '추석',
  '2026-09-26': '추석',
  '2026-10-05': '대체공휴일(개천절)',
  '2027-02-09': '대체공휴일(설날)',
  '2027-05-03': '대체공휴일(노동절)',
  '2027-07-19': '대체공휴일(제헌절)',
  '2027-12-27': '대체공휴일(기독탄신일)',
};
for (const [date, name] of Object.entries(expectNames)) {
  assert.equal(map[date], name, date);
}
// 2025년 제헌절은 공휴일이 아니었다 (2026-05-11 시행)
assert.equal(map['2025-07-17'], undefined);
assert.equal(map['2026-09-28'], undefined);
assert.equal(map['2025-05-01'], undefined);
assert.equal(weekday('2026-10-03'), 6);
assert.equal(weekday('2026-10-05'), 1);

// 짧은 이름
assert.equal(shortHolidayName('대체공휴일'), '대체휴일');
assert.equal(shortHolidayName('대체공휴일(삼일절)'), '대체휴일');
assert.equal(shortHolidayName('대체공휴일(부처님오신날)'), '대체휴일');
assert.equal(shortHolidayName('전국동시지방선거'), '지방선거');
assert.equal(shortHolidayName('제9회 전국동시지방선거'), '지방선거');
assert.equal(shortHolidayName('대통령선거'), '대선');
assert.equal(shortHolidayName('1월1일'), '신정');
assert.equal(shortHolidayName('기독탄신일'), '성탄절');
assert.equal(shortHolidayName('어린이날, 부처님오신날'), '어린이날, 부처님오신날');
assert.equal(shortHolidayName('추석'), '추석');

assert.deepEqual(
  mergeHolidays([
    { date: '2025-05-05', name: '부처님오신날' },
    { date: '2025-05-05', name: '어린이날' },
    { date: '2025-05-05', name: '어린이날' },
    { date: '2025-01-01', name: '1월1일' },
  ]),
  [
    { date: '2025-01-01', name: '1월1일' },
    { date: '2025-05-05', name: '부처님오신날, 어린이날' },
  ],
);

// KASI 응답 파싱
const kasiList = {
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
    body: {
      items: {
        item: [
          { dateKind: '01', dateName: '1월1일', isHoliday: 'Y', locdate: 20260101, seq: 1 },
          { dateKind: '01', dateName: '설날', isHoliday: 'Y', locdate: 20260217, seq: 1 },
          { dateKind: '01', dateName: '삼일절', isHoliday: 'Y', locdate: 20260301, seq: 1 },
          { dateKind: '01', dateName: '대체공휴일(삼일절)', isHoliday: 'Y', locdate: '20260302', seq: 1 },
          { dateKind: '01', dateName: '어린이날', isHoliday: 'Y', locdate: 20260505, seq: 1 },
          { dateKind: '01', dateName: '부처님오신날', isHoliday: 'Y', locdate: 20260505, seq: 2 },
          { dateKind: '01', dateName: '식목일', isHoliday: 'N', locdate: 20260405, seq: 1 },
          { dateKind: '01', dateName: '전국동시지방선거', isHoliday: 'Y', locdate: 20260603, seq: 1 },
          { dateKind: '01', dateName: '다른해', isHoliday: 'Y', locdate: 20270101, seq: 1 },
        ],
      },
      numOfRows: 100,
      pageNo: 1,
      totalCount: 9,
    },
  },
};
assert.deepEqual(parseKasiRestDeResponse(kasiList, 2026), [
  { date: '2026-01-01', name: '1월1일' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-03-02', name: '대체공휴일(삼일절)' },
  { date: '2026-05-05', name: '어린이날, 부처님오신날' },
  { date: '2026-06-03', name: '전국동시지방선거' },
]);

const kasiSingle = {
  response: {
    header: { resultCode: '00' },
    body: { items: { item: { dateName: '광복절', isHoliday: 'Y', locdate: 20260815 } }, totalCount: 1 },
  },
};
assert.deepEqual(parseKasiRestDeResponse(kasiSingle), [{ date: '2026-08-15', name: '광복절' }]);

const kasiEmpty = { response: { header: { resultCode: '00' }, body: { items: '', totalCount: 0 } } };
assert.deepEqual(parseKasiRestDeResponse(kasiEmpty, 2030), []);

assert.throws(() =>
  parseKasiRestDeResponse({ response: { header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } } }),
);
assert.throws(() => parseKasiRestDeResponse({ foo: 1 }));

// fetch: URL 파라미터와 XML 오류 응답
process.env.KASI_HOLIDAY_API_KEY = 'abc%2Bdef%3D%3D';
const calls: string[] = [];
const okFetch = (async (url: string | URL | Request) => {
  calls.push(String(url));
  return new Response(JSON.stringify(kasiList), { status: 200 });
}) as typeof fetch;
const holidays2026 = await fetchKasiHolidays(2026, okFetch);
assert.equal(holidays2026.length, 6);
assert.ok(calls[0].includes('/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?'));
assert.ok(calls[0].includes('serviceKey=abc%2Bdef%3D%3D&'));
assert.ok(!calls[0].includes('%25'));
assert.ok(calls[0].includes('solYear=2026'));
assert.ok(calls[0].includes('numOfRows=100'));
assert.ok(calls[0].includes('_type=json'));

const xmlFetch = (async () =>
  new Response('<OpenAPI_ServiceResponse><cmmMsgHeader>SERVICE ERROR</cmmMsgHeader></OpenAPI_ServiceResponse>', {
    status: 200,
  })) as typeof fetch;
await assert.rejects(() => fetchKasiHolidays(2026, xmlFetch));

delete process.env.KASI_HOLIDAY_API_KEY;
process.env.KHOA_TIDE_API_KEY = 'khoa-key';
calls.length = 0;
await fetchKasiHolidays(2026, okFetch);
assert.ok(calls[0].includes('serviceKey=khoa-key'));
delete process.env.KHOA_TIDE_API_KEY;
process.env.KASI_HOLIDAY_API_KEY = 'test-key';

// 갱신 정책
const now = new Date('2026-10-04T03:00:00Z');
const stored = (year: number, fetchedAt: string): StoredHolidayYear => ({
  year,
  holidays: [{ date: `${year}-01-01`, name: '1월1일' }],
  fetchedAt,
});
assert.equal(needsKasiRefresh(2026, null, now), true);
assert.equal(needsKasiRefresh(2025, stored(2025, '2025-01-01T00:00:00Z'), now), false);
assert.equal(needsKasiRefresh(2026, stored(2026, '2026-10-03T02:00:00Z'), now), true);
assert.equal(needsKasiRefresh(2026, stored(2026, '2026-10-04T00:00:00Z'), now), false);
assert.equal(needsKasiRefresh(2027, stored(2027, '2026-10-02T00:00:00Z'), now), true);

function memoryStore(initial: StoredHolidayYear[] = []) {
  const rows = new Map(initial.map((r) => [r.year, r]));
  const writes: StoredHolidayYear[] = [];
  const store: HolidayStore = {
    async read(year) {
      return rows.get(year) ?? null;
    },
    async write(row) {
      writes.push(row);
      rows.set(row.year, row);
    },
  };
  return { store, writes };
}

let fetchCount = 0;
const countingFetch = (async () => {
  fetchCount += 1;
  return new Response(JSON.stringify(kasiList), { status: 200 });
}) as typeof fetch;
const failingFetch = (async () => {
  fetchCount += 1;
  return new Response('boom', { status: 500 });
}) as typeof fetch;

// 저장 없음: KASI 에서 받아 저장
resetHolidayMemo();
fetchCount = 0;
{
  const { store, writes } = memoryStore();
  const payload = await getHolidayYear(2026, { store, fetchImpl: countingFetch, now });
  assert.equal(payload.source, 'kasi');
  assert.equal(payload.holidays.length, 6);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].year, 2026);
  assert.equal(fetchCount, 1);
  // 같은 프로세스 재요청은 메모
  await getHolidayYear(2026, { store, fetchImpl: countingFetch, now });
  assert.equal(fetchCount, 1);
}

// 지난 해: 저장값만 쓰고 다시 받지 않는다
resetHolidayMemo();
fetchCount = 0;
{
  const { store, writes } = memoryStore([stored(2025, '2025-02-01T00:00:00Z')]);
  const payload = await getHolidayYear(2025, { store, fetchImpl: countingFetch, now });
  assert.equal(payload.source, 'stored');
  assert.equal(fetchCount, 0);
  assert.equal(writes.length, 0);
}

// 올해 저장값이 하루 지남: 갱신
resetHolidayMemo();
fetchCount = 0;
{
  const { store, writes } = memoryStore([stored(2026, '2026-10-02T00:00:00Z')]);
  const payload = await getHolidayYear(2026, { store, fetchImpl: countingFetch, now });
  assert.equal(payload.source, 'kasi');
  assert.equal(fetchCount, 1);
  assert.equal(writes.length, 1);
}

// KASI 실패: 저장값 사용, 다시 요청해도 백오프
resetHolidayMemo();
fetchCount = 0;
{
  const { store } = memoryStore([stored(2026, '2026-10-01T00:00:00Z')]);
  const payload = await getHolidayYear(2026, { store, fetchImpl: failingFetch, now });
  assert.equal(payload.source, 'stored');
  assert.equal(fetchCount, 1);
}

// KASI 실패 + 저장소 없음: 번들 fallback
resetHolidayMemo();
fetchCount = 0;
{
  const payload = await getHolidayYear(2026, { store: null, fetchImpl: failingFetch, now });
  assert.equal(payload.source, 'fallback');
  assert.ok(payload.holidays.some((h) => h.date === '2026-10-05' && h.name === '대체공휴일(개천절)'));
}

// 키 없음: KASI 호출 없이 fallback, 범위 밖이면 빈 목록
resetHolidayMemo();
fetchCount = 0;
delete process.env.KASI_HOLIDAY_API_KEY;
{
  const payload = await getHolidayYear(2027, { store: null, fetchImpl: countingFetch, now });
  assert.equal(payload.source, 'fallback');
  assert.equal(fetchCount, 0);
  const none = await getHolidayYear(2040, { store: null, fetchImpl: countingFetch, now });
  assert.equal(none.source, 'none');
  assert.deepEqual(none.holidays, []);
}

// 저장소 읽기 오류도 fallback 으로 넘어간다
resetHolidayMemo();
{
  const broken: HolidayStore = {
    async read() {
      throw new Error('relation "holidays" does not exist');
    },
    async write() {},
  };
  const payload = await getHolidayYear(2026, { store: broken, fetchImpl: countingFetch, now });
  assert.equal(payload.source, 'fallback');
}

console.log('kasi-holidays tests passed');
