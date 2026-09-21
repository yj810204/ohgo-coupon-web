import { NextResponse } from 'next/server';
import { getTideLabel, getTideRegion, normalizeTideRegionId } from '@/lib/dadaepo-tide';
import { getTideForecast } from '@/lib/khoa-tide';
import { getTideAiCache, setTideAiCache } from '@/lib/tide-recommend-cache';
import {
  getTideFishAdvice,
  isTideAiDateOpen,
  isTideFishAdvice,
  normalizeDepartQuery,
  TIDE_AI_LOCK_MESSAGE,
  tideAiCacheKey,
  type TideFishAdvice,
} from '@/lib/tide-fish-recommend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function readServerEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function todaySeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sanitizeBriefing(text: string): string {
  return text
    .replace(/수심\s*15\s*[~\-–—]\s*20\s*m/gi, '')
    .replace(/수심\s*(?:15|20)\s*m(?:\s*(?:전후|주변|구간|까지))?/gi, '')
    .replace(/15\s*[~\-–—]\s*20\s*m/gi, '')
    .replace(/(?:15|20)\s*m까지\s*/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +([을를이가은는]) /g, ' ')
    .trim();
}

function asStringList(value: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\n+/) : fallback;
  const list = raw.map((item) => String(item).trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function jsonAdvice(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function askOpenAi(
  date: string,
  regionId: string,
  fallback: TideFishAdvice,
  refresh = false,
): Promise<TideFishAdvice | null> {
  const key = readServerEnv('OPENAI_API_KEY');
  if (!key) {
    console.error('[tide-recommend] OPENAI_API_KEY missing');
    return null;
  }

  const region = getTideRegion(regionId);
  const label = getTideLabel(date);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: refresh ? 0.55 : 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              '너는 부산 다대포항 선상 낚시 30년차 고수다.',
              '갯바위가 아닌 내만 선상, 구멍찌(막대찌)만 다룬다.',
              '구멍찌 기본 2호. 약하면 1.5호, 세면 2.5~3호.',
              '원줄 1.5~1.75, 목줄 2.5~3호.',
              '약하거나 정조면 전유동, 중조·세면 반유동. 초보자는 모두 반유동이어도 된다.',
              '전유동·반유동이 무엇인지 정의하거나 비교 설명하지 마라.',
              '오늘 추천 방식 하나만 말하라. 전유동과 반유동을 나란히 쓰지 마라.',
              'headline에 오늘 브리핑만 3~5줄로 써라. 줄마다 줄바꿈(\\n).',
              '1줄: 오늘 전유동 또는 반유동, 찌 호수, 목줄 m, 좁쌀봉돌 호수(B·G2·G3·2B).',
              '2줄: 그 채비로 어떻게 흘리거나 잡는지. 정의·비교 금지.',
              '3~4줄: 물색 맑을 때 / 탁할 때 운용.',
              '수심이라는 단어와 15m·20m는 쓰지 마라. 제목형 문장, 전유동과 반유동 병기 금지.',
              '물때·출항·조류로만 추론하라.',
              'tips는 빈 배열 [].',
              'JSON만. 키: species, headline, tips, rig, currentLabel.',
              '과장·조과 보장 금지. rig에는 호수·전유동/반유동·수중만.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `날짜 ${date}`,
              `지역 ${region.label}`,
              '포인트 다대포항 내만권 선상',
              `물때 ${label}`,
              `출항 ${fallback.departureTime}`,
              `추정 조류 ${fallback.currentLabel}`,
              `규칙 추천 어종 ${fallback.species.join(', ')}`,
              `규칙 채비 ${fallback.rig}`,
              '이 출항·조류에 맞게 오늘 쓸 대상어와 채비·운용만 한 브리핑으로 다듬어 주세요.',
            ].join('\n'),
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error('[tide-recommend] openai status', response.status);
      return null;
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}') as Partial<TideFishAdvice> & {
      species?: unknown;
      tips?: unknown;
    };
    const species = asStringList(parsed.species, fallback.species)
      .flatMap((name) => name.split(/[,·]/))
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 4);
    const tips = asStringList(parsed.tips, []).slice(0, 2);
    const advice: TideFishAdvice = {
      ...fallback,
      species: species.length > 0 ? species : fallback.species,
      headline: typeof parsed.headline === 'string' && parsed.headline.trim()
        ? sanitizeBriefing(parsed.headline)
        : fallback.headline,
      tips: tips.length > 0 ? tips : fallback.tips,
      source: 'ai',
      currentLabel: typeof parsed.currentLabel === 'string' && parsed.currentLabel.trim()
        ? parsed.currentLabel.trim()
        : fallback.currentLabel,
      rig: typeof parsed.rig === 'string' && parsed.rig.trim() ? parsed.rig.trim() : fallback.rig,
    };
    return isTideFishAdvice(advice) ? advice : null;
  } catch (error) {
    console.error('[tide-recommend] openai failed', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) {
    return jsonAdvice({ error: '날짜가 올바르지 않습니다.' }, 400);
  }

  const regionId = normalizeTideRegionId(searchParams.get('region'));
  const departureTime = normalizeDepartQuery(searchParams.get('depart'));
  const refresh = searchParams.get('refresh') === '1';
  let events;
  try {
    const forecast = await getTideForecast(date, regionId);
    events = forecast.events;
  } catch {
    events = undefined;
  }

  const fallback = getTideFishAdvice(date, getTideRegion(regionId), { events, departureTime });
  if (!fallback) {
    return jsonAdvice({ error: '물때 정보를 찾을 수 없습니다.' }, 404);
  }

  const key = tideAiCacheKey(date, regionId, fallback.departureTime);
  const cached = getTideAiCache(key);
  if (cached && !refresh) {
    return jsonAdvice(cached);
  }

  const today = todaySeoul();
  if (!isTideAiDateOpen(date, today)) {
    return jsonAdvice({
      ...fallback,
      locked: true,
      lockMessage: TIDE_AI_LOCK_MESSAGE,
    });
  }

  const advice = await askOpenAi(date, regionId, fallback, refresh);
  if (!advice) {
    if (refresh) {
      return jsonAdvice({ error: 'ai_failed', ...fallback }, 503);
    }
    return jsonAdvice(fallback);
  }
  setTideAiCache(key, advice);
  return jsonAdvice(advice);
}
