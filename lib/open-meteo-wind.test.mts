import assert from 'node:assert/strict';
import {
  aggregateWindWindow,
  buildWindWeatherPayload,
  hourlySeries,
  isWindWeatherPayload,
  OPEN_METEO_LAT,
  OPEN_METEO_LON,
  OPEN_METEO_MODEL,
  weatherCodeText,
  windDirText,
  windGrade,
  type OpenMeteoForecast,
} from './open-meteo-wind.ts';

assert.equal(windGrade(4, 8), '양호');
assert.equal(windGrade(3.9, 7.9), '양호');
assert.equal(windGrade(4.1, 7), '주의');
assert.equal(windGrade(3, 8.1), '주의');
assert.equal(windGrade(6, 8), '주의');
assert.equal(windGrade(6.1, 8), '불리');
assert.equal(windGrade(5, 12.1), '불리');
assert.equal(windGrade(8, 12), '불리');
assert.equal(windGrade(8.1, 8), '강풍');
assert.equal(windGrade(3, 15.1), '강풍');

assert.equal(windDirText(0), '북');
assert.equal(windDirText(360), '북');
assert.equal(windDirText(22.5), '북북동');
assert.equal(windDirText(45), '북동');
assert.equal(windDirText(70), '동북동');
assert.equal(windDirText(90), '동');
assert.equal(windDirText(180), '남');
assert.equal(windDirText(270), '서');
assert.equal(windDirText(337.5), '북북서');
assert.equal(windDirText(-22.5), '북북서');

assert.equal(weatherCodeText(0), '맑음');
assert.equal(weatherCodeText(3), '흐림');
assert.equal(weatherCodeText(61), '비');
assert.equal(weatherCodeText(95), '뇌우');

const wrapMean = aggregateWindWindow(
  [6, 7],
  [
    { hour: 6, speed: 2, gust: 4, dir: 350 },
    { hour: 7, speed: 4, gust: 6, dir: 10 },
  ],
);
assert.equal(wrapMean.avgMs, 3);
assert.equal(wrapMean.gustMaxMs, 6);
assert.equal(wrapMean.dirDeg, 0);
assert.equal(wrapMean.hourCount, 2);

function hoursForDay(date: string): string[] {
  return Array.from({ length: 24 }, (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`);
}

const date = '2026-09-25';
const times = hoursForDay(date);
const speeds = times.map((_, hour) => (hour >= 6 && hour <= 12 ? 2.4 : hour >= 14 && hour <= 18 ? 2.5 : 1.8));
const gusts = times.map((_, hour) => (hour >= 6 && hour <= 12 ? 7.4 : hour >= 14 && hour <= 18 ? 7.5 : 5));
const dirs = times.map((_, hour) => (hour >= 6 && hour <= 12 ? 70 : 45));
const codes = times.map(() => 1);
const precips = times.map((_, hour) => (hour === 16 ? 0.2 : 0));

const raw: OpenMeteoForecast = {
  latitude: 35.0,
  longitude: 129.0,
  timezone: 'Asia/Seoul',
  hourly: {
    time: times,
    wind_speed_10m: speeds,
    wind_gusts_10m: gusts,
    wind_direction_10m: dirs,
    weather_code: codes,
    precipitation: precips,
  },
};

const payload = buildWindWeatherPayload(date, raw, '2026-09-23T15:00:00+09:00');
assert.equal(payload.ok, true);
if (!payload.ok) throw new Error('expected ok');
assert.equal(payload.date, date);
assert.deepEqual(payload.coords.request, [OPEN_METEO_LAT, OPEN_METEO_LON]);
assert.deepEqual(payload.coords.grid, [35, 129]);
assert.equal(payload.model, OPEN_METEO_MODEL);
assert.equal(payload.windows.length, 2);
assert.equal(payload.windows[0].id, 'am6');
assert.equal(payload.windows[0].label, '오전 06–12');
assert.equal(payload.windows[0].avgMs, 2.4);
assert.equal(payload.windows[0].gustMaxMs, 7.4);
assert.equal(payload.windows[0].dirText, '동북동');
assert.equal(payload.windows[0].grade, '양호');
assert.equal(payload.windows[0].hourCount, 7);
assert.equal(payload.windows[1].id, 'pm14');
assert.equal(payload.windows[1].avgMs, 2.5);
assert.equal(payload.windows[1].gustMaxMs, 7.5);
assert.equal(payload.windows[1].dirText, '북동');
assert.equal(payload.windows[1].grade, '양호');
assert.equal(payload.hours.find((point) => point.hour === 9)?.speed, 2.4);
assert.equal(payload.hours.find((point) => point.hour === 9)?.dirText, '동북동');
assert.equal(payload.hours.find((point) => point.hour === 9)?.dirDeg, 70);
assert.equal(payload.hours.find((point) => point.hour === 9)?.weatherCode, 1);
assert.equal(payload.hours.find((point) => point.hour === 16)?.dirText, '북동');
assert.equal(payload.hours.some((point) => point.hour < 4 || point.hour > 18), false);
assert.equal(payload.weatherCodeMax, 1);
assert.equal(payload.weatherText, '대체로 맑음');
assert.equal(payload.precipMmSum, 0.2);
assert.equal(payload.attribution, 'Open-Meteo / ECMWF IFS');
assert.equal(isWindWeatherPayload(payload), true);
assert.equal(isWindWeatherPayload({ ok: false, error: 'x' }), false);

const suffixed = hourlySeries(
  { wind_speed_10m_ecmwf_ifs025: [1, 2, 3] },
  'wind_speed_10m',
);
assert.deepEqual(suffixed, [1, 2, 3]);

const missing = buildWindWeatherPayload('2026-01-01', raw);
assert.equal(missing.ok, false);
if (missing.ok) throw new Error('expected missing date');
assert.match(missing.error, /해당 날짜/);

const empty = buildWindWeatherPayload(date, {});
assert.equal(empty.ok, false);

console.log('open-meteo-wind tests passed');
