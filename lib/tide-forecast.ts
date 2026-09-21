export type TideEventType = 'high' | 'low';

export type TideForecastEvent = {
  type: TideEventType;
  time: string;
  heightCm: number;
  deltaCm: number | null;
  at: number;
};

export type TideCurveAnchor = {
  at: number;
  heightCm: number;
  type: TideEventType;
};

export function interpolateTideCurve(
  anchors: TideCurveAnchor[],
  samplesPerSegment = 20,
): Array<{ at: number; heightCm: number }> {
  const sorted = [...anchors].sort((a, b) => a.at - b.at);
  if (sorted.length === 0) return [];
  if (sorted.length === 1) return [{ at: sorted[0].at, heightCm: sorted[0].heightCm }];

  const out: Array<{ at: number; heightCm: number }> = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const u = step / samplesPerSegment;
      out.push({
        at: from.at + (to.at - from.at) * u,
        heightCm:
          (from.heightCm + to.heightCm) / 2 +
          ((from.heightCm - to.heightCm) / 2) * Math.cos(Math.PI * u),
      });
    }
  }
  const last = sorted[sorted.length - 1];
  out.push({ at: last.at, heightCm: last.heightCm });
  return out;
}

export type TideForecastPayload = {
  ok: true;
  date: string;
  region: {
    id: string;
    label: string;
    stationLabel: string;
  };
  events: TideForecastEvent[];
  anchors: TideCurveAnchor[];
};
