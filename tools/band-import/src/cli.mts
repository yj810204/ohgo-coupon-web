import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { hasProfile } from './browser.mts';
import { DEFAULT_OUT_DIR, runFetch, runLogin, USER_DATA_DIR } from './commands.mts';
import { validateExtracted } from './schema.mts';
import { readSession } from './session-store.mts';
import { parseBandPostUrl } from './url.mts';

const USAGE = `사용법:
  npm run band:login
  npm run band:fetch -- <band 게시글 URL> [--headed] [--no-headed-fallback] [--timeout 30] [--out DIR] [--dry-run]
  npm run band:gui
  npm run band:validate -- <extracted.json>

예:
  npm run band:fetch -- https://band.us/band/88348442/post/2925`;

async function fetchCommand(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      headed: { type: 'boolean', default: false },
      'no-headed-fallback': { type: 'boolean', default: false },
      timeout: { type: 'string', default: '30' },
      out: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (positionals.length !== 1) throw new Error(`게시글 URL 하나가 필요합니다.\n\n${USAGE}`);
  const ref = parseBandPostUrl(positionals[0]);
  const outRoot = values.out ?? DEFAULT_OUT_DIR;
  const timeoutSec = Number(values.timeout);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) throw new Error('--timeout 은 초 단위 양수여야 합니다');

  if (values['dry-run']) {
    console.log(
      JSON.stringify(
        {
          ...ref,
          outDir: join(outRoot, ref.postId),
          userDataDir: USER_DATA_DIR,
          hasProfile: hasProfile(USER_DATA_DIR),
          savedSessionAt: readSession(USER_DATA_DIR)?.savedAt ?? null,
        },
        null,
        2,
      ),
    );
    return;
  }
  const { extracted, outDir } = await runFetch({
    url: positionals[0],
    headless: !values.headed,
    headedFallback: !values['no-headed-fallback'],
    timeoutMs: timeoutSec * 1000,
    outRoot,
  });
  console.log('');
  console.log(`제목: ${extracted.title || '(없음)'}`);
  console.log(`추출 방식: ${extracted.extractedVia}, 이미지 ${extracted.images.length}개, 일정 ${extracted.schedules.length}개`);
  if (extracted.scheduleLikeLines.length) console.log(`일정 같은 줄: ${extracted.scheduleLikeLines.length}개`);
  for (const w of extracted.warnings) console.log(`주의: ${w}`);
  console.log(`저장: ${relative(process.cwd(), join(outDir, 'extracted.json'))}`);
}

function validateCommand(argv: string[]): void {
  if (argv.length !== 1) throw new Error(`파일 경로 하나가 필요합니다.\n\n${USAGE}`);
  const errors = validateExtracted(JSON.parse(readFileSync(argv[0], 'utf8')));
  if (errors.length) throw new Error(`스키마 오류:\n${errors.join('\n')}`);
  console.log('스키마 OK');
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'login':
      return runLogin();
    case 'fetch':
      return fetchCommand(rest);
    case 'validate':
      return validateCommand(rest);
    default:
      console.log(USAGE);
      if (command && command !== 'help' && command !== '--help') process.exitCode = 1;
  }
}

main().catch((err: Error) => {
  console.error(`오류: ${err.message}`);
  process.exitCode = 1;
});
