import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPhotoDraft, classifyPost, validatePhotoDraft } from '../src/classify.mts';
import { buildExtracted } from '../src/extracted.mts';
import { findPostInJson, normalizeApiPost } from '../src/normalize.mts';
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
  parseDateList,
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
assert.deepEqual(fixtureTrip.draft.dates, [kstDate(fixturePost.schedules[0].startAt)]);
assert.equal(fixtureTrip.draft.departureTime, '05:30', '본문의 출항 시각이 첨부 시각보다 우선');
assert.equal(fixtureTrip.draft.species, '갈치');
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
assert.deepEqual(trip.draft, {
  dates: ['2026-10-12'],
  destination: '형제섬',
  departureTime: '05:00',
  returnTime: '14:00',
  species: '참돔',
  capacity: 10,
  price: 120000,
  contact: '010-1234-5678',
  notes: schedule.body,
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
assert.deepEqual(attachedTrip.draft.dates, ['2026-10-11', '2026-10-12']);
assert.equal(attachedTrip.draft.departureTime, '05:30');
assert.equal(attachedTrip.draft.returnTime, '14:00');

// 필수 칸이 비면 missing으로 알린다
const vague = parseTripGuide(makePost('다음 출조 공지는 곧 올리겠습니다'));
assert.deepEqual(vague.missing, ['날짜', '목적지', '출항 시간']);
assert.equal(validateTripDraft(vague.draft).length, 3);
assert.deepEqual(validateTripDraft({ ...trip.draft, dates: ['2026-02-30'], departureTime: '5:00' }), [
  '날짜 형식이 잘못되었습니다: 2026-02-30 (예: 2026-10-12)',
  '출항 시간 형식이 잘못되었습니다: 5:00 (예: 05:30)',
]);
assert.ok(validateTripDraft({ ...trip.draft, capacity: NaN }).some((e) => e.includes('정원')));

// 여러 날짜 후보는 힌트로
const multi = parseTripGuide(makePost('10/12 출항 05:00 목적지 나무섬\n10/13도 같은 시간 출조'));
assert.deepEqual(multi.draft.dates, ['2026-10-12']);
assert.ok(multi.hints.some((h) => h.includes('2026-10-13')));

// 날짜 칸 입력 해석
assert.deepEqual(parseDateList('2026-10-12, 10/13\n10월 14일', '2026-10-06'), ['2026-10-12', '2026-10-13', '2026-10-14']);
assert.deepEqual(parseDateList('2026-10-12, 2026-10-12', '2026-10-06'), ['2026-10-12']);
assert.deepEqual(parseDateList('엉뚱', '2026-10-06'), ['엉뚱'], '해석 못한 값은 그대로 두어 검사에서 걸리게 한다');

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
});
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
