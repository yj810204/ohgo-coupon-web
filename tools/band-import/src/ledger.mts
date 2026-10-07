import { join } from 'node:path';
import { readJsonFile, writeJsonPrivate } from './local-store.mts';

export const LEDGER_FILE = 'ledger.json';

export type LedgerTarget = 'community_photos' | 'trip_guides';

export type LedgerEntry = {
  key: string;
  /** Supabase 프로젝트 ref. 프로젝트가 다르면 다른 장부 줄로 본다 */
  project: string;
  bandId: string;
  postId: string;
  sourceUrl: string;
  target: LedgerTarget;
  rowIds: string[];
  title: string;
  registeredAt: string;
  by: string | null;
};

export type Ledger = { version: 1; entries: Record<string, LedgerEntry> };

export function ledgerKey(project: string, bandId: string, postId: string): string {
  return `${project}/${bandId}/${postId}`;
}

/** 장부가 깨졌으면 조용히 비우지 않고 멈춘다(중복 등록을 막기 위해) */
export function readLedger(dir: string): Ledger {
  let raw: Ledger | null;
  try {
    raw = readJsonFile<Ledger>(join(dir, LEDGER_FILE));
  } catch (err) {
    throw new Error(`등록 장부(${join(dir, LEDGER_FILE)})를 읽지 못했습니다: ${(err as Error).message}`);
  }
  if (!raw) return { version: 1, entries: {} };
  if (raw.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) {
    throw new Error(`등록 장부(${join(dir, LEDGER_FILE)}) 형식이 잘못되었습니다.`);
  }
  return raw;
}

export function findLedgerEntry(dir: string, project: string, bandId: string, postId: string): LedgerEntry | null {
  return readLedger(dir).entries[ledgerKey(project, bandId, postId)] ?? null;
}

export function recordLedgerEntry(dir: string, entry: Omit<LedgerEntry, 'key'>): LedgerEntry {
  const ledger = readLedger(dir);
  const full: LedgerEntry = { key: ledgerKey(entry.project, entry.bandId, entry.postId), ...entry };
  ledger.entries[full.key] = full;
  writeJsonPrivate(dir, LEDGER_FILE, ledger);
  return full;
}
