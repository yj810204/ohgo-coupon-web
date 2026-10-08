import { kstIso } from './check-state.mts';
import { runCheck } from './check-run.mts';

/**
 * 새 글 확인 전용 진입점. 기존 cli.mts(login/fetch/gui)는 건드리지 않는다.
 * `node .../check-cli.mts` 와 `node .../check-cli.mts check` 둘 다 된다.
 */
async function main(): Promise<void> {
  const command = process.argv[2];
  if (command && command !== 'check') {
    process.stderr.write('사용법: npm run -s band:check\n');
    process.exitCode = 1;
    return;
  }
  let written = false;
  try {
    const code = await runCheck({
      log: (msg) => console.error(msg),
      report: (body) => {
        written = true;
        process.stdout.write(`${JSON.stringify(body)}\n`);
      },
    });
    process.exitCode = code;
  } catch (err) {
    if (!written) {
      process.stdout.write(`${JSON.stringify({ status: 'error', checkedAt: kstIso(new Date()), message: (err as Error).message })}\n`);
    }
    process.exitCode = 1;
  }
}

main();
