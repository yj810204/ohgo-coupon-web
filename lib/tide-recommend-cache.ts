import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { isTideFishAdvice, type TideFishAdvice } from '@/lib/tide-fish-recommend';

const memory = new Map<string, TideFishAdvice>();

function cacheFilePath(): string {
  return join(process.env.TIDE_AI_CACHE_DIR || '/tmp', 'ohgo-tide-ai-cache.json');
}

function readDisk(): Record<string, TideFishAdvice> {
  try {
    const raw = readFileSync(cacheFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, TideFishAdvice> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isTideFishAdvice(value) && value.source === 'ai') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDisk(all: Record<string, TideFishAdvice>) {
  try {
    const file = cacheFilePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(all));
  } catch {
    // ignore disk failures — memory cache still works
  }
}

export function getTideAiCache(key: string): TideFishAdvice | null {
  const hit = memory.get(key);
  if (hit) return hit;
  const disk = readDisk()[key];
  if (!disk) return null;
  memory.set(key, disk);
  return disk;
}

export function setTideAiCache(key: string, advice: TideFishAdvice) {
  if (advice.source !== 'ai') return;
  memory.set(key, advice);
  const all = readDisk();
  all[key] = advice;
  writeDisk(all);
}
