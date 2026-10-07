import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 오고피씽 로그인 세션과 등록 장부를 두는 폴더(gitignore). 세션 파일은 본인만 읽을 수 있게 0600으로 쓴다 */
export function ensurePrivateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeJsonPrivate(dir: string, name: string, value: unknown): void {
  ensurePrivateDir(dir);
  const path = join(dir, name);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

export function removeFile(dir: string, name: string): void {
  rmSync(join(dir, name), { force: true });
}
