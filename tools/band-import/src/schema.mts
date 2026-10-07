import type { RawContent } from './rich-text.mts';

export const EXTRACTED_SCHEMA_VERSION = 1;

export type ExtractedImage = {
  index: number;
  sourceUrl: string;
  /** out/{postId}/ 기준 상대 경로. 다운로드 실패 시 null */
  file: string | null;
  width: number | null;
  height: number | null;
};

export type ExtractedSchedule = {
  name: string;
  description: string | null;
  /** ISO 8601 (UTC) */
  startAt: string | null;
  endAt: string | null;
  isAllDay: boolean | null;
};

export type ExtractedPost = {
  schemaVersion: typeof EXTRACTED_SCHEMA_VERSION;
  source: {
    url: string;
    bandId: string;
    postId: string;
    fetchedAt: string;
  };
  extractedVia: 'api' | 'dom';
  author: string | null;
  /** ISO 8601 (UTC) */
  createdAt: string | null;
  /** Band 게시글에는 제목이 없어 본문 첫 줄에서 만든다 */
  title: string;
  body: string;
  images: ExtractedImage[];
  /** Band 일정 첨부(있을 때만) */
  schedules: ExtractedSchedule[];
  /** 본문에서 날짜/시간 패턴이 보이는 줄 */
  scheduleLikeLines: string[];
  warnings: string[];
  /** 글자색, 굵게가 남아 있는 원래 본문. 예전에 가져온 결과에는 없다 */
  rawContent?: RawContent | null;
};

type Check = (value: unknown) => boolean;

const isString: Check = (v) => typeof v === 'string';
const isNullableString: Check = (v) => v === null || typeof v === 'string';
const isNullableNumber: Check = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
const isNullableBoolean: Check = (v) => v === null || typeof v === 'boolean';
const isIsoOrNull: Check = (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
const isStringArray: Check = (v) => Array.isArray(v) && v.every(isString);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkFields(
  errors: string[],
  path: string,
  obj: unknown,
  spec: Record<string, Check>,
): void {
  if (!isRecord(obj)) {
    errors.push(`${path}: 객체가 아님`);
    return;
  }
  for (const [key, check] of Object.entries(spec)) {
    if (!(key in obj)) errors.push(`${path}.${key}: 누락`);
    else if (!check(obj[key])) errors.push(`${path}.${key}: 타입 불일치`);
  }
}

export function validateExtracted(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['root: 객체가 아님'];

  if (value.schemaVersion !== EXTRACTED_SCHEMA_VERSION) {
    errors.push(`schemaVersion: ${EXTRACTED_SCHEMA_VERSION} 이어야 함`);
  }
  checkFields(errors, 'source', value.source, {
    url: isString,
    bandId: (v) => typeof v === 'string' && /^\d+$/.test(v),
    postId: (v) => typeof v === 'string' && /^\d+$/.test(v),
    fetchedAt: (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
  });
  checkFields(errors, 'root', value, {
    extractedVia: (v) => v === 'api' || v === 'dom',
    author: isNullableString,
    createdAt: isIsoOrNull,
    title: isString,
    body: isString,
    images: Array.isArray,
    schedules: Array.isArray,
    scheduleLikeLines: isStringArray,
    warnings: isStringArray,
  });

  if ('rawContent' in value && value.rawContent !== null) {
    const rc = value.rawContent;
    if (!isRecord(rc) || (rc.format !== 'band' && rc.format !== 'dom') || typeof rc.html !== 'string') errors.push('rawContent: 타입 불일치');
  }
  if (Array.isArray(value.images)) {
    value.images.forEach((img, i) =>
      checkFields(errors, `images[${i}]`, img, {
        index: (v) => Number.isInteger(v),
        sourceUrl: isString,
        file: isNullableString,
        width: isNullableNumber,
        height: isNullableNumber,
      }),
    );
  }
  if (Array.isArray(value.schedules)) {
    value.schedules.forEach((s, i) =>
      checkFields(errors, `schedules[${i}]`, s, {
        name: isString,
        description: isNullableString,
        startAt: isIsoOrNull,
        endAt: isIsoOrNull,
        isAllDay: isNullableBoolean,
      }),
    );
  }
  return errors;
}
