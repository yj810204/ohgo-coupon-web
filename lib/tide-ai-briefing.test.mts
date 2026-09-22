import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  briefingDisplaySections,
  formatBriefingProse,
  hasTideAiBriefingContent,
  parseBriefingEmphasis,
  parseBriefingMarkup,
  isTideAiBriefing,
  normalizeTideAiBriefingInput,
  omitUndefinedNull,
  parseBriefingMarkdown,
  TIDE_BRIEFING_ONPAGE_FOOTER,
  TIDE_BRIEFING_TITLE,
  toBriefingWritePayload,
  toTideAiBriefing,
} from '@/utils/tide-ai-briefing-shared';

assert.equal(TIDE_BRIEFING_TITLE, 'AI 출조 브리핑');
assert.match(TIDE_BRIEFING_ONPAGE_FOOTER, /전날 저녁/);
assert.doesNotMatch(TIDE_BRIEFING_ONPAGE_FOOTER, /채팅|확인하세요/);

assert.deepEqual(
  parseBriefingMarkdown(`## 요약
조류 약함

## 채비
1.5호 구멍찌

## 운용
만조 전후`),
  {
    summary: '조류 약함',
    rig: '1.5호 구멍찌',
    operation: '만조 전후',
  },
);

assert.deepEqual(parseBriefingMarkdown('본문만 있는 경우'), {
  summary: '본문만 있는 경우',
  rig: '',
  operation: '',
});

const longMarkdown = `【요약】
4물이라 조류가 약합니다. 초보라면 전유동으로 천천히 내려보세요.

**채비**
1.5~2호 구멍찌 전유동, 수중 G2

# 운용
만조 전후에 입질이 납니다. 정조에는 미끼를 오래 두지 마세요.`;

const fromMarkdown = normalizeTideAiBriefingInput({
  date: '2026-09-23',
  markdown: longMarkdown,
});
assert.equal(fromMarkdown.summary, '');
assert.equal(fromMarkdown.rig, '');
assert.equal(fromMarkdown.operation, '');
assert.match(fromMarkdown.markdown ?? '', /초보라면 전유동/);

const cleared = normalizeTideAiBriefingInput({
  date: '2026-09-23',
  markdown: longMarkdown,
  summary: '',
  rig: '',
  operation: '',
});
assert.equal(cleared.summary, '');
assert.equal(cleared.rig, '');
assert.equal(cleared.operation, '');

const keepShorts = normalizeTideAiBriefingInput({
  date: '2026-09-23',
  markdown: longMarkdown,
  summary: '짧은 요약',
});
assert.equal(keepShorts.summary, '짧은 요약');
assert.equal(keepShorts.rig, '');
assert.equal(keepShorts.operation, '');

const display = briefingDisplaySections(
  toTideAiBriefing(
    normalizeTideAiBriefingInput({
      date: '2026-09-23',
      summary: '짧은 요약',
      rig: '짧은 채비',
      operation: '짧은 운용',
      markdown: longMarkdown,
    }),
  ),
);
assert.equal(display.length, 1);
assert.equal(display[0].key, 'markdown');
assert.match(display[0].body, /초보라면 전유동/);
assert.match(display[0].body, /만조 전후/);
assert.doesNotMatch(display[0].body, /^## /m);
assert.doesNotMatch(display[0].body, /^요약$/m);
assert.doesNotMatch(display[0].label, /요약/);
assert.equal(display[0].label, TIDE_BRIEFING_TITLE);
assert.equal(formatBriefingProse('## 요약\n긴 글'), '긴 글');
assert.equal(
  formatBriefingProse('오늘은 **전유동**이 맞습니다.'),
  '오늘은 **전유동**이 맞습니다.',
);
assert.deepEqual(parseBriefingEmphasis('오늘은 **전유동**이 맞습니다.'), [
  { text: '오늘은 ' },
  { text: '전유동', bold: true },
  { text: '이 맞습니다.' },
]);
assert.deepEqual(parseBriefingEmphasis('핵심은 <u>밑줄</u>과 <b>굵게</b>입니다.'), [
  { text: '핵심은 ' },
  { text: '밑줄', underline: true },
  { text: '과 ' },
  { text: '굵게', bold: true },
  { text: '입니다.' },
]);
assert.deepEqual(parseBriefingMarkup('<u onclick="alert(1)">핵심</u>'), [
  { type: 'u', children: [{ type: 'text', text: '핵심' }] },
]);
assert.deepEqual(
  parseBriefingEmphasis('클릭 <script>alert(1)</script> <img src=x> <a href="http://x">링크</a> <u>남김</u>'),
  [{ text: '클릭 alert(1)  링크 ' }, { text: '남김', underline: true }],
);
assert.deepEqual(parseBriefingMarkup('한줄<br>다음'), [
  { type: 'text', text: '한줄' },
  { type: 'br' },
  { type: 'text', text: '다음' },
]);
assert.deepEqual(parseBriefingMarkup('<strong>굵게</strong>와 <em>기울임</em>'), [
  { type: 'strong', children: [{ type: 'text', text: '굵게' }] },
  { type: 'text', text: '와 ' },
  { type: 'em', children: [{ type: 'text', text: '기울임' }] },
]);

const productionLikeBody = `# 「AI 출조 브리핑」 — 2026-09-23 (수)

내일은 <u>5물</u>입니다. 물 높이는 새벽 0시 27분 간조 45cm, <u>오전 6시 22분 만조 104cm</u>입니다.`;

const productionDisplay = briefingDisplaySections(
  toTideAiBriefing({
    date: '2026-09-23',
    summary: productionLikeBody,
    rig: '',
    operation: '',
    markdown: productionLikeBody,
  }),
);
assert.equal(productionDisplay.length, 1);
assert.equal(productionDisplay[0].key, 'markdown');
assert.equal(productionDisplay[0].label, TIDE_BRIEFING_TITLE);
assert.doesNotMatch(productionDisplay[0].label, /요약/);
assert.doesNotMatch(productionDisplay[0].body, /#\s*「AI 출조 브리핑」/);
assert.doesNotMatch(productionDisplay[0].body, /^「AI 출조 브리핑」/m);
assert.match(productionDisplay[0].body, /<u>5물<\/u>/);
assert.deepEqual(parseBriefingEmphasis('내일은 <u>5물</u>입니다.'), [
  { text: '내일은 ' },
  { text: '5물', underline: true },
  { text: '입니다.' },
]);

const summaryOnlyDisplay = briefingDisplaySections(
  toTideAiBriefing({
    date: '2026-09-23',
    summary: productionLikeBody,
    markdown: '',
  }),
);
assert.equal(summaryOnlyDisplay[0].key, 'markdown');
assert.doesNotMatch(summaryOnlyDisplay[0].label, /요약/);

const shortsOnly = briefingDisplaySections(
  toTideAiBriefing(
    normalizeTideAiBriefingInput({
      date: '2026-09-23',
      summary: '짧은 요약',
      rig: '짧은 채비',
      operation: '짧은 운용',
    }),
  ),
);
assert.deepEqual(shortsOnly.map((section) => section.key), ['summary', 'rig', 'operation']);

const writeCleared = toBriefingWritePayload(toTideAiBriefing(cleared));
assert.equal(writeCleared.summary, '');
assert.equal(writeCleared.rig, '');
assert.equal(writeCleared.operation, '');
assert.ok(typeof writeCleared.markdown === 'string' && writeCleared.markdown.includes('초보라면'));

const structured = normalizeTideAiBriefingInput({
  date: '2026-09-23',
  summary: '  요약  ',
  rig: '채비',
  operation: '운용',
  species: '감성돔 · 노래미',
});
assert.deepEqual(structured.species, ['감성돔', '노래미']);
assert.ok(hasTideAiBriefingContent(toTideAiBriefing(structured)));

assert.equal(
  hasTideAiBriefingContent(toTideAiBriefing(normalizeTideAiBriefingInput({ date: '2026-09-23' }))),
  false,
);

const stored = toTideAiBriefing(structured, {
  publishedAt: '2026-09-22T11:00:00.000Z',
  updatedAt: '2026-09-22T11:00:00.000Z',
});
assert.ok(isTideAiBriefing(stored));
assert.equal(stored.date, '2026-09-23');
assert.equal(Object.hasOwn(stored, 'title'), false);
assert.equal(Object.hasOwn(structured, 'title'), false);

const withTitle = toTideAiBriefing(
  normalizeTideAiBriefingInput({ date: '2026-09-23', summary: '있음', title: '  내일 출조  ' }),
);
assert.equal(withTitle.title, '내일 출조');

const stripped = omitUndefinedNull({
  date: '2026-09-23',
  title: undefined,
  extra: null,
  summary: 'ok',
});
assert.deepEqual(stripped, { date: '2026-09-23', summary: 'ok' });
assert.ok(Object.values(stripped).every((value) => value !== undefined && value !== null));

const productionLike = toBriefingWritePayload(
  toTideAiBriefing(
    normalizeTideAiBriefingInput({
      date: '2026-09-23',
      summary: '4물이라 조류가 약합니다.',
      rig: '1.5~2호 구멍찌 전유동, 수중 G2',
      operation: '만조 전후 입질이 낫습니다.',
    }),
  ),
);
assert.equal(Object.hasOwn(productionLike, 'title'), false);
assert.ok(Object.values(productionLike).every((value) => value !== undefined && value !== null));

const dir = await mkdtemp(join(tmpdir(), 'tide-briefing-'));
process.env.TIDE_BRIEFING_STORE = 'file';
process.env.TIDE_BRIEFING_FILE_PATH = join(dir, 'briefings.json');
process.env.NEXT_PUBLIC_DATA_SOURCE = 'firebase';

const { publishTideAiBriefing, getTideAiBriefing, resolveTideAiBriefingStore } = await import(
  '@/utils/tide-ai-briefing-service'
);
assert.equal(resolveTideAiBriefingStore(), 'file');

const published = await publishTideAiBriefing({
  date: '2026-09-23',
  summary: '내일은 4물입니다.',
  rig: '1.5~2호 구멍찌 전유동',
  operation: '만조 전후를 노리세요.',
});
assert.equal(published.date, '2026-09-23');
assert.equal((await getTideAiBriefing('2026-09-23'))?.summary, '내일은 4물입니다.');

const republished = await publishTideAiBriefing({
  date: '2026-09-23',
  markdown: longMarkdown,
  summary: '',
  rig: '',
  operation: '',
});
assert.equal(republished.summary, '');
assert.equal((await getTideAiBriefing('2026-09-23'))?.summary, '');
assert.match((await getTideAiBriefing('2026-09-23'))?.markdown ?? '', /초보라면 전유동/);

const raw = JSON.parse(await readFile(process.env.TIDE_BRIEFING_FILE_PATH, 'utf8'));
assert.equal(raw['2026-09-23'].summary, '');
assert.equal(raw['2026-09-23'].operation, '');
assert.match(raw['2026-09-23'].markdown, /초보라면 전유동/);
assert.equal(Object.hasOwn(raw['2026-09-23'], 'title'), false);
assert.ok(Object.values(raw['2026-09-23']).every((value) => value !== undefined && value !== null));

await rm(dir, { recursive: true, force: true });
console.log('tide-ai-briefing tests passed');
