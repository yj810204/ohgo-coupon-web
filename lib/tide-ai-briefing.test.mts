import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hasTideAiBriefingContent,
  isTideAiBriefing,
  normalizeTideAiBriefingInput,
  parseBriefingMarkdown,
  TIDE_BRIEFING_ONPAGE_FOOTER,
  TIDE_BRIEFING_TITLE,
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

const fromMarkdown = normalizeTideAiBriefingInput({
  date: '2026-09-23',
  markdown: `【요약】
4물 약류

**채비**
전유동

# 운용
입질은 만조 전`,
});
assert.equal(fromMarkdown.summary, '4물 약류');
assert.equal(fromMarkdown.rig, '전유동');
assert.equal(fromMarkdown.operation, '입질은 만조 전');

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

const raw = JSON.parse(await readFile(process.env.TIDE_BRIEFING_FILE_PATH, 'utf8'));
assert.equal(raw['2026-09-23'].operation, '만조 전후를 노리세요.');

await rm(dir, { recursive: true, force: true });
console.log('tide-ai-briefing tests passed');
