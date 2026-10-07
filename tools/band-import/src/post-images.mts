import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtractedPost } from './schema.mts';

export const UPLOADABLE_IMAGE = /^[\w-]+\.(jpe?g|png|gif|webp)$/i;
/** 가져오기가 저장하는 이름: 01.jpg, 02.png ... */
const DOWNLOADED_NAME = /^(\d{1,3})\.([a-z0-9]{2,5})$/i;

export type PostImages = {
  /** out/{postId}/ 안에 실제로 있고 올릴 수 있는 사진, 번호 순 */
  files: string[];
  warnings: string[];
};

/**
 * extracted.json의 사진 목록과 out/{postId}/ 폴더를 맞춰 본다.
 * 목록이 비었거나 다시 가져오며 줄어도 폴더에 받아 둔 사진은 모두 쓴다.
 */
export function resolvePostImages(outDir: string, post: ExtractedPost): PostImages {
  const warnings: string[] = [];
  const isFile = (f: string) => {
    const p = join(outDir, f);
    return existsSync(p) && statSync(p).isFile();
  };
  const listed = post.images.map((i) => i.file).filter((f): f is string => !!f);
  const missing = listed.filter((f) => !isFile(f));
  if (missing.length) warnings.push(`extracted.json에 있는데 폴더에 없는 사진: ${missing.join(', ')}`);
  const failed = post.images.filter((i) => !i.file).length;
  if (failed) warnings.push(`가져오기에서 받지 못한 사진 ${failed}장은 올리지 않습니다`);

  const onDisk = existsSync(outDir) ? readdirSync(outDir).filter((f) => DOWNLOADED_NAME.test(f) && isFile(f)) : [];
  const listedSet = new Set(listed);
  const extra = onDisk.filter((f) => !listedSet.has(f));

  const candidates = [...new Set([...listed.filter((f) => !missing.includes(f)), ...extra])];
  const unsupported = candidates.filter((f) => !UPLOADABLE_IMAGE.test(f));
  if (unsupported.length) warnings.push(`올릴 수 없는 형식이라 뺀 파일: ${unsupported.join(', ')}`);
  const files = candidates.filter((f) => UPLOADABLE_IMAGE.test(f)).sort(byNumber);
  const added = extra.filter((f) => UPLOADABLE_IMAGE.test(f));
  if (added.length) warnings.push(`extracted.json에 없지만 폴더에 있는 사진 ${added.length}장도 넣었습니다: ${added.sort(byNumber).join(', ')}`);
  if (files.length === 0) warnings.push('올릴 사진이 없습니다. 가져오기를 다시 해 보세요.');
  return { files, warnings };
}

function byNumber(a: string, b: string): number {
  const na = Number(DOWNLOADED_NAME.exec(a)?.[1] ?? Infinity);
  const nb = Number(DOWNLOADED_NAME.exec(b)?.[1] ?? Infinity);
  return na - nb || a.localeCompare(b);
}
