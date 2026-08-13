#!/usr/bin/env node
/**
 * 016_legacy_firebase_staging.sql 적용
 *
 * 우선순위:
 * 1) DATABASE_URL 또는 SUPABASE_DB_URL 이 있으면 pg로 실행
 * 2) 없으면 SQL 경로를 출력하고 Dashboard 안내
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const sqlPath = resolve(process.cwd(), 'supabase/migrations/016_legacy_firebase_staging.sql');
const sql = readFileSync(sqlPath, 'utf8');
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function main() {
  if (!dbUrl) {
    console.log('DATABASE_URL / SUPABASE_DB_URL 없음 — Dashboard에서 SQL을 실행하세요.\n');
    console.log('Supabase Dashboard → SQL Editor → 아래 파일 내용 붙여넣기 후 Run:\n');
    console.log(sqlPath);
    console.log('\n--- SQL preview (first 20 lines) ---');
    console.log(sql.split('\n').slice(0, 20).join('\n'));
    console.log('...');
    process.exit(0);
  }

  const { default: pg } = await import('pg').catch(() => ({ default: null }));
  if (!pg) {
    console.error('pg 패키지 없음. npm i -D pg 후 재실행하거나 Dashboard SQL Editor를 사용하세요.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('016_legacy_firebase_staging.sql 적용 완료');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
