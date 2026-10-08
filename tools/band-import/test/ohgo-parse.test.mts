import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPhotoDraft, classifyPost, validatePhotoDraft } from '../src/classify.mts';
import { buildExtracted } from '../src/extracted.mts';
import { findPostInJson, normalizeApiPost, normalizeDomSnapshot } from '../src/normalize.mts';
import type { ExtractedPost, ExtractedSchedule } from '../src/schema.mts';
import {
  findCapacity,
  findContact,
  findDates,
  findDestination,
  findPrice,
  findSpecies,
  findTimes,
  findTripTimes,
  kstDate,
  parseDateInput,
  parseWeeklyRows,
  parseTripGuide,
  validateTripDraft,
} from '../src/trip-parse.mts';
import { normalizeTitle } from '../src/title.mts';
import { parseBandPostUrl } from '../src/url.mts';

const ref = parseBandPostUrl('https://band.us/band/88348442/post/2925');

function makePost(body: string, opts: { photos?: number; createdAt?: string; schedules?: ExtractedSchedule[] } = {}): ExtractedPost {
  const photos = opts.photos ?? 0;
  return buildExtracted({
    ref,
    via: 'api',
    post: {
      author: '선장',
      createdAt: opts.createdAt ?? '2026-10-06T01:00:00.000Z',
      body,
      images: Array.from({ length: photos }, (_, i) => ({ url: `https://x/${i}.jpg`, width: 10, height: 10 })),
      schedules: opts.schedules ?? [],
    },
    images: Array.from({ length: photos }, (_, i) => ({
      index: i,
      sourceUrl: `https://x/${i}.jpg`,
      file: `${String(i + 1).padStart(2, '0')}.jpg`,
      width: 10,
      height: 10,
    })),
    fetchedAt: new Date('2026-10-07T00:00:00.000Z'),
  });
}

// KST 날짜/시각
assert.equal(kstDate('2026-10-06T16:00:00.000Z'), '2026-10-07');
assert.equal(kstDate('2026-10-06T14:59:00.000Z'), '2026-10-06');
assert.equal(kstDate(null), null);

// 날짜 찾기: 연도 있음/없음, 슬래시, 요일 붙은 점, 오늘/내일, 연말 넘김
assert.deepEqual(findDates('2026.10.12 출항', '2026-10-06').map((d) => d.date), ['2026-10-12']);
assert.deepEqual(findDates('10월 12일(일) 갈치', '2026-10-06').map((d) => d.date), ['2026-10-12']);
assert.deepEqual(findDates('10/12, 10/13 출조', '2026-10-06').map((d) => d.date), ['2026-10-12', '2026-10-13']);
assert.deepEqual(findDates('10.12(일) 출조', '2026-10-06').map((d) => d.date), ['2026-10-12']);
assert.deepEqual(findDates('내일 출항합니다', '2026-10-06').map((d) => d.date), ['2026-10-07']);
assert.deepEqual(findDates('1월 3일 출조', '2026-12-20').map((d) => d.date), ['2027-01-03'], '연말 글의 1월은 다음 해');
assert.deepEqual(findDates('씨알 3.5kg, 2/30 없음', '2026-10-06'), [], '무게와 없는 날짜는 무시');
assert.deepEqual(findDates('2026-10-12 05:30', '2026-10-06').map((d) => d.date), ['2026-10-12'], '연도 날짜 안의 월/일을 다시 세지 않음');

// 시각 찾기
assert.deepEqual(findTimes('출항 05:30').map((t) => t.time), ['05:30']);
assert.deepEqual(findTimes('새벽 5시 반 출항').map((t) => t.time), ['05:30']);
assert.deepEqual(findTimes('오후 2시 입항').map((t) => t.time), ['14:00']);
assert.deepEqual(findTimes('오전 6시 30분 집결').map((t) => t.time), ['06:30']);
assert.deepEqual(findTimes('3시간 정도 소요'), [], '시간(duration)은 제외');
assert.deepEqual(findTimes('10/12 출조'), [], '날짜는 시각이 아님');

assert.deepEqual(findTripTimes('출항 05:30 다대포항'), { departure: '05:30', return: null });
assert.deepEqual(findTripTimes('출항 05:30 ~ 14:00'), { departure: '05:30', return: '14:00' });
assert.deepEqual(findTripTimes('입항 오후 2시, 출항 새벽 5시'), { departure: '05:00', return: '14:00' });
assert.deepEqual(findTripTimes('집결 04:40\n출조 05:00\n철수 13시'), { departure: '05:00', return: '13:00' }, '집결보다 출조 시각');
assert.deepEqual(findTripTimes('승선 04:40 다대포항'), { departure: '04:40', return: null }, '출항 시각이 없으면 집결 시각');
assert.deepEqual(findTripTimes('05:30 출항'), { departure: '05:30', return: null });
assert.deepEqual(findTripTimes('오늘 12:30에 들어왔습니다'), { departure: null, return: null }, '라벨 없는 시각은 쓰지 않음');

// 그 밖의 칸
assert.equal(findDestination('목적지: 나무섬, 형제섬 일대'), '나무섬');
assert.equal(findDestination('포인트 : 남형제섬\n출항 5시'), '남형제섬');
assert.equal(findDestination('오늘은 형제섬으로 갑니다', ['나무섬', '형제섬']), '형제섬', '앱에 있던 목적지와 맞춤');
assert.equal(findDestination('출항 5시'), '');
assert.equal(findSpecies('대상어종: 참돔, 광어'), '참돔');
assert.equal(findSpecies('갈치 출조 안내 #갈치 #갑오징어'), '갈치, 갑오징어');
assert.equal(findSpecies('무늬오징어 출조'), '무늬오징어', '긴 이름 안의 짧은 이름은 겹치지 않음');
assert.equal(findCapacity('정원 12명'), 12);
assert.equal(findCapacity('선착순 8분 모십니다'), 8);
assert.equal(findCapacity('12명 한정'), 12);
assert.equal(findCapacity('3마리'), null);
assert.equal(findPrice('선비 100,000원'), 100000);
assert.equal(findPrice('1인 12만원'), 120000);
assert.equal(findPrice('요금 문의'), null);
assert.equal(findContact('문의 010 1234 5678'), '010-1234-5678');
assert.equal(findContact('없음'), '');

// 합성 픽스처(일정 첨부 포함) -> 출조 일정
const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-post.json', import.meta.url), 'utf8'));
const normalized = normalizeApiPost(findPostInJson(fixture, ref.postId)!);
const fixturePost = buildExtracted({
  ref,
  via: 'api',
  post: normalized,
  images: [{ index: 0, sourceUrl: normalized.images[0].url, file: '01.jpg', width: 1080, height: 1440 }],
  fetchedAt: new Date('2026-10-06T22:00:00.000Z'),
});
const fixtureClass = classifyPost(fixturePost);
assert.equal(fixtureClass.kind, 'schedule');
assert.ok(fixtureClass.reasons.some((r) => r.includes('Band 일정 첨부')));
const fixtureTrip = parseTripGuide(fixturePost);
assert.deepEqual(fixtureTrip.draft.rows.map((r) => r.date), [kstDate(fixturePost.schedules[0].startAt)]);
assert.equal(fixtureTrip.draft.rows[0].departureTime, '05:30', '본문의 출항 시각이 첨부 시각보다 우선');
assert.equal(fixtureTrip.draft.rows[0].species, '갈치');
assert.equal(fixtureTrip.draft.capacity, 12);
assert.deepEqual(fixtureTrip.missing, ['목적지'], '목적지는 못 찾으면 운영자가 채운다');

// 출조 안내 글(첨부 없음)
const schedule = makePost(
  [
    '[출조 안내] 10월 12일(일) 참돔 출조',
    '목적지: 형제섬',
    '집결 04:40 다대포항, 출항 05:00 ~ 14:00',
    '대상어종: 참돔, 광어',
    '정원 10명, 선비 120,000원',
    '예약 문의 010-1234-5678',
  ].join('\n'),
);
const scheduleClass = classifyPost(schedule);
assert.equal(scheduleClass.kind, 'schedule');
const trip = parseTripGuide(schedule);
assert.equal(trip.source, 'single');
assert.deepEqual(trip.draft, {
  destination: '형제섬',
  capacity: 10,
  contact: '010-1234-5678',
  rows: [{ date: '2026-10-12', departureTime: '05:00', returnTime: '14:00', species: '참돔', price: 120000, notes: schedule.body, selected: true }],
});
assert.deepEqual(trip.missing, []);
assert.deepEqual(validateTripDraft(trip.draft), []);

// 일정 첨부만 있고 본문에 시각이 없으면 첨부 시각을 쓴다
const attached = makePost('이번 주 출조 일정입니다', {
  schedules: [
    { name: '출조', description: null, startAt: '2026-10-10T20:30:00.000Z', endAt: '2026-10-11T05:00:00.000Z', isAllDay: false },
    { name: '출조', description: null, startAt: '2026-10-11T20:30:00.000Z', endAt: null, isAllDay: false },
  ],
});
const attachedTrip = parseTripGuide(attached);
assert.deepEqual(attachedTrip.draft.rows.map((r) => r.date), ['2026-10-11', '2026-10-12']);
assert.ok(attachedTrip.draft.rows.every((r) => r.departureTime === '05:30' && r.returnTime === '14:00'));

// 필수 칸이 비면 missing으로 알린다
const vague = parseTripGuide(makePost('다음 출조 공지는 곧 올리겠습니다'));
assert.deepEqual(vague.missing, ['날짜', '목적지', '출항 시간']);
assert.equal(validateTripDraft(vague.draft).length, 3);
assert.deepEqual(validateTripDraft({ ...trip.draft, rows: [{ ...trip.draft.rows[0], date: '2026-02-30', departureTime: '5:00' }] }), [
  '1번째 줄 날짜 형식이 잘못되었습니다: 2026-02-30 (예: 2026-10-12)',
  '1번째 줄 출항 시간 형식이 잘못되었습니다: 5:00 (예: 05:30)',
]);
assert.ok(validateTripDraft({ ...trip.draft, rows: [] }).includes('저장할 출조 줄을 1개 이상 고르세요'));
assert.ok(validateTripDraft({ ...trip.draft, rows: [{ ...trip.draft.rows[0], price: NaN }] }).some((e) => e.includes('1인 요금')));
assert.ok(validateTripDraft({ ...trip.draft, capacity: NaN }).some((e) => e.includes('정원')));

// 여러 날짜 후보는 힌트로
const multi = parseTripGuide(makePost('10/12 출항 05:00 목적지 나무섬\n10/13도 같은 시간 출조'));
assert.deepEqual(multi.draft.rows.map((r) => r.date), ['2026-10-12']);
assert.ok(multi.hints.some((h) => h.includes('2026-10-13')));

// 날짜 칸 입력 해석
assert.equal(parseDateInput('2026-10-12', '2026-10-06'), '2026-10-12');
assert.equal(parseDateInput(' 10/13 ', '2026-10-06'), '2026-10-13');
assert.equal(parseDateInput('10월 14일', '2026-10-06'), '2026-10-14');
assert.equal(parseDateInput('엉뚱', '2026-10-06'), '엉뚱', '해석 못한 값은 그대로 두어 검사에서 걸리게 한다');

// 운영자가 가져온 실제 주간 일정 글(본문 그대로). 화면(DOM)으로 읽어 게시일이 없고 가져온 날이 기준
const weeklyBody = readFileSync(new URL('./fixtures/schedule-post-weekly.txt', import.meta.url), 'utf8');
const weeklyDom = normalizeDomSnapshot({ author: '오고피씽', createdText: null, bodyText: weeklyBody, imageUrls: ['https://a.pstatic.net/w/1.jpg'] });
const weeklyPost = buildExtracted({
  ref,
  via: 'dom',
  post: weeklyDom,
  images: [{ index: 0, sourceUrl: weeklyDom.images[0].url, file: '01.jpg', width: null, height: null }],
  fetchedAt: new Date('2026-10-06T23:00:00.000Z'),
});
const weeklyClass = classifyPost(weeklyPost);
assert.equal(weeklyClass.kind, 'schedule', weeklyClass.reasons.join(', '));
assert.ok(weeklyClass.reasons.some((r) => r.includes('날짜별 출항 줄 7개')));
const weekly = parseTripGuide(weeklyPost, ['낫개', '형제섬']);
assert.equal(weekly.source, 'weekly');
const W = (date: string, departureTime: string, notes: string) => ({ date, species: '감성돔', departureTime, returnTime: '', price: 100000, notes, selected: true });
assert.deepEqual(weekly.draft, {
  destination: '낫개',
  capacity: null,
  contact: '010-3597-4100',
  rows: [
    W('2026-10-05', '06:00', '예약마감'),
    W('2026-10-06', '07:00', '자리여유'),
    W('2026-10-07', '06:00', '자리여유'),
    W('2026-10-08', '06:00', '자리여유'),
    W('2026-10-09', '06:00', '예약마감'),
    W('2026-10-10', '06:00', '자리여유'),
    W('2026-10-11', '06:00', '자리여유'),
  ],
});
assert.deepEqual(weekly.missing, []);
assert.deepEqual(validateTripDraft(weekly.draft), []);
assert.ok(weekly.hints.some((h) => h.includes('"낫개"')), '목적지를 기본값으로 넣었다고 알린다');
assert.ok(weekly.hints.some((h) => h.includes('비고')), '상태를 비고에 넣었다고 알린다');
for (const row of weekly.draft.rows) {
  assert.ok(!/카카오|3333|8058209|신분증|최소출항|#/.test(row.notes), `안내문이 비고에 들어가면 안 된다: ${row.notes}`);
}
assert.equal(parseTripGuide(weeklyPost).draft.destination, '', '앱 목적지를 모르면 비워 두고 운영자가 채운다');

// 줄 모양이 조금씩 다른 경우
const variants = parseWeeklyRows(
  [
    '10월 5일 ~ 10월 11일',
    '5일   (월) 감성돔 06시 출항 예약마감',
    '6일(화) 감성돔 6시30분 출항',
    '7일 (수) 감성돔 06:30 출항 ~ 14:00 자리 여유',
    '8일 (목) 감성돔 오전 6시 출항, 오후 문어 1시 출항 18시입항 마감',
    '9일 (금) 오후문어 2시 출항',
    '10일 (토) 감성돔/벵에돔 05시 출항 휴항',
    '* 감성돔선비10만원입니다',
    '* 문어 선비8만원입니다.',
    '     (06시출항 13시입항)',
    '* 문어종일 선비 10만원 입니다 .',
    '      (06시출항 15시입항)',
  ].join('\n'),
  '2026-10-04',
);
assert.deepEqual(
  variants.rows.map((r) => [r.date, r.species, r.departureTime, r.returnTime, r.price, r.notes, r.selected]),
  [
    ['2026-10-05', '감성돔', '06:00', '', 100000, '예약마감', true],
    ['2026-10-06', '감성돔', '06:30', '', 100000, '', true],
    ['2026-10-07', '감성돔', '06:30', '14:00', 100000, '자리여유', true],
    ['2026-10-08', '감성돔', '06:00', '', 100000, '', true],
    ['2026-10-08', '문어', '13:00', '18:00', null, '마감', true],
    ['2026-10-09', '문어', '14:00', '', null, '', true],
    ['2026-10-10', '감성돔, 벵에돔', '05:00', '', 100000, '휴항', false],
  ],
);
assert.ok(variants.hints.some((h) => h.includes('문어 선비가 여러 개')), '선비가 둘이면 비우고 알린다');
assert.ok(variants.hints.some((h) => h.includes('문어 입항 시간이 여러 개')), '입항이 둘이면 비우고 알린다');

// 12월에서 1월로 넘어가는 주
const yearEnd = parseWeeklyRows('12월 29일 ~ 1월 4일\n29일 (화) 감성돔 06시 출항\n2일 (토) 감성돔 06시 출항', '2026-12-27');
assert.deepEqual(yearEnd.rows.map((r) => r.date), ['2026-12-29', '2027-01-02']);
assert.deepEqual(yearEnd.hints, [], '요일이 맞으면 알림이 없다');
const fetchedInJan = parseWeeklyRows('12월 29일 ~ 1월 4일\n29일 (화) 감성돔 06시 출항\n2일 (토) 감성돔 06시 출항', '2027-01-02');
assert.deepEqual(fetchedInJan.rows.map((r) => r.date), ['2026-12-29', '2027-01-02'], '1월에 가져와도 12월은 지난해');
assert.ok(parseWeeklyRows('5일 (화) 감성돔 06시 출항', '2026-10-01').hints.some((h) => h.includes('월요일인데')), '요일이 다르면 알린다');
assert.deepEqual(parseWeeklyRows('오늘 감성돔 마릿수 좋았습니다\n6일(화) 감성돔 조황', '2026-10-06').rows.filter((r) => r.departureTime), [], '조황 글의 날짜 줄은 출조가 아니다');

// 조황 글 -> 조황 사진 게시판
const catchPost = makePost('오늘 갑오징어 조황입니다\n손님들 쿨러 가득 채우셨습니다\n수고하셨습니다', { photos: 5 });
const catchClass = classifyPost(catchPost);
assert.equal(catchClass.kind, 'catch');
assert.ok(catchClass.scores.catch > catchClass.scores.schedule);
const photo = buildPhotoDraft(catchPost);
assert.deepEqual(photo, {
  title: '오늘 갑오징어 조황 입니다',
  description: '손님들 쿨러 가득 채우셨습니다\n수고하셨습니다',
  photoDate: '2026-10-06',
  images: ['01.jpg', '02.jpg', '03.jpg', '04.jpg', '05.jpg'],
  hashtags: [],
});
const tagged = buildPhotoDraft(makePost('오늘 감성돔 조황\n사 이 즈 👍\n선 장 010\n[#조황 #이벤트 #오고피싱]'));
assert.equal(tagged.description, '사이즈 👍\n선장 010');
assert.deepEqual(tagged.hashtags, ['조황', '이벤트', '오고피싱']);
assert.deepEqual(validatePhotoDraft(photo), []);
assert.deepEqual(validatePhotoDraft({ ...photo, title: ' ', images: [] }), ['제목을 입력하세요', '조황 게시판에는 사진이 1장 이상 필요합니다']);
assert.ok(validatePhotoDraft({ ...photo, images: ['../secret.jpg'] }).includes('사진 파일 이름이 잘못되었습니다'));

// 단서가 없으면 사진 유무로 정한다
assert.equal(classifyPost(makePost('감사합니다', { photos: 1 })).kind, 'catch');
assert.equal(classifyPost(makePost('감사합니다')).kind, 'schedule');

// 사진 많은 조황 글에 날짜가 섞여 있어도 조황
assert.equal(classifyPost(makePost('10월 5일 조황\n참돔 마릿수 좋았습니다\n씨알 굿', { photos: 8 })).kind, 'catch');

// 이벤트 조황 글: 예약 단어와 다음 출조 날짜가 있어도 제목이 조황이고 사진이 많으면 조황
const eventCatch = makePost(
  '오늘6일(화)이벤트4주차감성돔조황입니다.\n손님들 고생하셨습니다\n다음 출조 10월 8일 06:00 출항\n예약 문의 010-1234-5678\n자리 선착순 마감',
  { photos: 11 },
);
assert.equal(classifyPost(eventCatch).kind, 'catch');
assert.equal(classifyPost(makePost('감사합니다', { photos: 5 }), 0).kind, 'schedule', '사진 수를 따로 넘기면 그 수로 판단');
assert.equal(classifyPost(makePost('[출조 안내] 10월 12일 참돔\n출항 05:00', { photos: 2 })).kind, 'schedule');

// 제목 정리
assert.equal(normalizeTitle('오늘6일(화)이벤트4주차감성돔조황입니다.'), '6일(화) 이벤트4주차 감성돔조황 입니다.');
const titleCases: [string, string][] = [
  ['내일10월12일(일)쭈꾸미조황', '10월12일(일) 쭈꾸미조황'],
  ['10/6(월)갑오징어조과입니다!', '10/6(월) 갑오징어조과 입니다!'],
  ['오늘 참가자미조황입니다', '오늘 참가자미조황 입니다'],
  ['이벤트 3 주차 문어조황', '이벤트3주차 문어조황'],
  ['금일7일(수)주꾸미조황입니다', '7일(수) 주꾸미조황 입니다'],
  ['대물감성돔조황 입니다', '대물 감성돔조황 입니다'],
  ['  감성돔조황입니다.  ', '감성돔조황 입니다.'],
  ['오늘 조황', '오늘 조황'],
  ['3일간 출조 안내', '3일간 출조 안내'],
  ['1.5kg 참돔 조황', '1.5kg 참돔 조황'],
  ['6일(화) 이벤트4주차 감성돔조황 입니다.', '6일(화) 이벤트4주차 감성돔조황 입니다.'],
];
for (const [raw, want] of titleCases) assert.equal(normalizeTitle(raw), want, raw);
const eventDraft = buildPhotoDraft(eventCatch);
assert.equal(eventDraft.title, '6일(화) 이벤트4주차 감성돔조황 입니다.');
assert.ok(eventDraft.description.startsWith('손님들'), '원래 제목 줄은 내용에서 뺀다');
assert.deepEqual(buildPhotoDraft(eventCatch, ['02.png']).images, ['02.png']);

// 사용자 문구에 가운뎃점이 없어야 한다
for (const text of [...scheduleClass.reasons, ...catchClass.reasons, ...multi.hints, ...validateTripDraft(vague.draft)]) {
  assert.ok(!text.includes('\u00b7'), text);
}

console.log('band-import ohgo parse tests passed');
