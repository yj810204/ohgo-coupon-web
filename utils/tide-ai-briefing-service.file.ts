import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  briefingFromUnknown,
  toBriefingWritePayload,
  toTideAiBriefing,
  type TideAiBriefing,
} from '@/utils/tide-ai-briefing-shared';

function storePath(): string {
  return process.env.TIDE_BRIEFING_FILE_PATH?.trim() || `${process.cwd()}/.data/tide-ai-briefings.json`;
}

async function readStore(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function writeStore(store: Record<string, unknown>): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export async function getTideAiBriefing(date: string): Promise<TideAiBriefing | null> {
  const store = await readStore();
  return briefingFromUnknown(store[date]);
}

export async function publishTideAiBriefing(briefing: TideAiBriefing): Promise<TideAiBriefing> {
  const store = await readStore();
  const existing = briefingFromUnknown(store[briefing.date]);
  const next = toTideAiBriefing(briefing, {
    publishedAt: existing?.publishedAt || briefing.publishedAt,
    updatedAt: new Date().toISOString(),
  });
  store[next.date] = toBriefingWritePayload(next);
  await writeStore(store);
  return next;
}
