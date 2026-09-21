import { NextResponse } from 'next/server';
import { getTideLabel, getTideRegion, normalizeTideRegionId } from '@/lib/dadaepo-tide';
import { getTideForecast } from '@/lib/khoa-tide';
import {
  getTideFishAdvice,
  isTideFishAdvice,
  normalizeDepartQuery,
  TIDE_FISH_GROUND,
  type TideFishAdvice,
} from '@/lib/tide-fish-recommend';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cache = new Map<string, { at: number; advice: TideFishAdvice }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

function cacheKey(date: string, regionId: string, depart: string): string {
  return `v3:${date}:${regionId}:${depart}`;
}

async function askOpenAi(
  date: string,
  regionId: string,
  fallback: TideFishAdvice,
): Promise<TideFishAdvice | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const region = getTideRegion(regionId);
  const label = getTideLabel(date);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              '당신은 부산 다대포항 선상낚시 가이드입니다.',
              '연안 갯바위가 아니라 선상, 내만권 수심 15~20m 구멍찌(막대찌) 전유동/반유동만 다룹니다.',
              '찌 호수는 2호가 기본입니다. 조류가 약하면 1.5호, 세면 2.5~3호입니다. 원줄·목줄 호수로 쓰지 마세요.',
              'headline과 tips는 줄바꿈(\\n)으로 짧게 나누세요.',
              '반드시 JSON만 답합니다. 키: species(2~4), headline, tips(3~4), rig, currentLabel.',
              '과장·조과 보장은 쓰지 마세요. 채비는 호수·전유동/반유동을 구체적으로.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `날짜 ${date}, 지역 ${region.label}, 포인트 ${TIDE_FISH_GROUND}.`,
              `물때 ${label}, 출항 ${fallback.departureTime}, 추정 조류 ${fallback.currentLabel}.`,
              `규칙 추천 어종: ${fallback.species.join(', ')}.`,
              `규칙 채비: ${fallback.rig}.`,
              '이 출항시각·조류에 맞는 선상 찌낚시 대상어와 채비를 다듬어 주세요.',
            ].join(' '),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}') as Partial<TideFishAdvice>;
    const advice: TideFishAdvice = {
      species: (parsed.species ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 4),
      headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
      tips: (parsed.tips ?? []).map((tip) => tip.trim()).filter(Boolean).slice(0, 4),
      source: 'ai',
      ground: fallback.ground,
      departureTime: fallback.departureTime,
      currentKn: fallback.currentKn,
      currentLabel: typeof parsed.currentLabel === 'string' && parsed.currentLabel.trim()
        ? parsed.currentLabel.trim()
        : fallback.currentLabel,
      rig: typeof parsed.rig === 'string' && parsed.rig.trim() ? parsed.rig.trim() : fallback.rig,
    };
    return isTideFishAdvice(advice) ? advice : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });
  }

  const regionId = normalizeTideRegionId(searchParams.get('region'));
  const departureTime = normalizeDepartQuery(searchParams.get('depart'));
  let events;
  try {
    const forecast = await getTideForecast(date, regionId);
    events = forecast.events;
  } catch {
    events = undefined;
  }

  const fallback = getTideFishAdvice(date, getTideRegion(regionId), { events, departureTime });
  if (!fallback) {
    return NextResponse.json({ error: '물때 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const key = cacheKey(date, regionId, fallback.departureTime);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.advice);
  }

  const advice = (await askOpenAi(date, regionId, fallback)) ?? fallback;
  cache.set(key, { at: Date.now(), advice });
  return NextResponse.json(advice);
}
