/**
 * 부산 다대포 물때(몇물).
 * 한국천문연구원 음력 일자 + 남해 15물 주기(바다타임/국립해양조사원 표기와 동일).
 * 음력 1·16일 8물(최대)은 사리로 표시한다.
 */

/** 음력 초하루의 양력 YYYYMMDD (2018-01 ~ 2036-12, KASI) */
const LUNAR_MONTH_STARTS = [
  20180117, 20180216, 20180317, 20180416, 20180515, 20180614, 20180713, 20180811, 20180910, 20181009, 20181108, 20181207,
  20190106, 20190205, 20190307, 20190405, 20190505, 20190603, 20190703, 20190801, 20190830, 20190929, 20191028, 20191127, 20191226,
  20200125, 20200224, 20200324, 20200423, 20200523, 20200621, 20200721, 20200819, 20200917, 20201017, 20201115, 20201215,
  20210113, 20210212, 20210313, 20210412, 20210512, 20210610, 20210710, 20210808, 20210907, 20211006, 20211105, 20211204,
  20220103, 20220201, 20220303, 20220401, 20220501, 20220530, 20220629, 20220729, 20220827, 20220926, 20221025, 20221124, 20221223,
  20230122, 20230220, 20230322, 20230420, 20230520, 20230618, 20230718, 20230816, 20230915, 20231015, 20231113, 20231213,
  20240111, 20240210, 20240310, 20240409, 20240508, 20240606, 20240706, 20240804, 20240903, 20241003, 20241101, 20241201, 20241231,
  20250129, 20250228, 20250329, 20250428, 20250527, 20250625, 20250725, 20250823, 20250922, 20251021, 20251120, 20251220,
  20260119, 20260217, 20260319, 20260417, 20260517, 20260615, 20260714, 20260813, 20260911, 20261011, 20261109, 20261209,
  20270108, 20270207, 20270308, 20270407, 20270506, 20270605, 20270704, 20270802, 20270901, 20270930, 20271029, 20271128, 20271228,
  20280127, 20280225, 20280326, 20280425, 20280524, 20280623, 20280722, 20280820, 20280919, 20281018, 20281116, 20281216,
  20290115, 20290213, 20290315, 20290414, 20290513, 20290612, 20290712, 20290810, 20290908, 20291008, 20291106, 20291205,
  20300104, 20300203, 20300304, 20300403, 20300502, 20300601, 20300701, 20300730, 20300829, 20300927, 20301027, 20301125, 20301225,
  20310123, 20310222, 20310323, 20310422, 20310521, 20310620, 20310719, 20310818, 20310917, 20311016, 20311115, 20311214,
  20320113, 20320211, 20320312, 20320410, 20320509, 20320608, 20320707, 20320806, 20320905, 20321004, 20321103, 20321203,
  20330101, 20330131, 20330301, 20330331, 20330429, 20330528, 20330627, 20330726, 20330825, 20330923, 20331023, 20331122, 20331222,
  20340120, 20340219, 20340320, 20340419, 20340518, 20340616, 20340716, 20340814, 20340913, 20341012, 20341111, 20341211,
  20350110, 20350208, 20350310, 20350408, 20350508, 20350606, 20350705, 20350804, 20350902, 20351001, 20351031, 20351130, 20351229,
  20360128, 20360227, 20360328, 20360426, 20360526, 20360624, 20360723, 20360822, 20360920, 20361019, 20361118, 20361218,
];

/** 음력 1일부터의 15물 주기. 8물(최대)은 사리 */
const TIDE_BY_LUNAR_DAY = [
  '사리',
  '9물',
  '10물',
  '11물',
  '12물',
  '13물',
  '14물',
  '조금',
  '1물',
  '2물',
  '3물',
  '4물',
  '5물',
  '6물',
  '7물',
] as const;

function parseYmd(dateStr: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toYmdNum(y: number, m: number, d: number): number {
  return y * 10000 + m * 100 + d;
}

/** 양력 YYYY-MM-DD → 음력 일(1–30). 테이블 밖이면 null */
export function getKoreanLunarDay(dateStr: string): number | null {
  const parsed = parseYmd(dateStr);
  if (!parsed) return null;
  const target = toYmdNum(parsed.y, parsed.m, parsed.d);
  const first = LUNAR_MONTH_STARTS[0];
  const last = LUNAR_MONTH_STARTS[LUNAR_MONTH_STARTS.length - 1];
  if (target < first || target > last + 29) return null;

  let lo = 0;
  let hi = LUNAR_MONTH_STARTS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (LUNAR_MONTH_STARTS[mid] <= target) lo = mid + 1;
    else hi = mid - 1;
  }
  const start = LUNAR_MONTH_STARTS[hi];
  if (!start) return null;
  const sy = Math.floor(start / 10000);
  const sm = Math.floor(start / 100) % 100;
  const sd = start % 100;
  const day =
    Math.round(
      (Date.UTC(parsed.y, parsed.m - 1, parsed.d) - Date.UTC(sy, sm - 1, sd)) / 86400000,
    ) + 1;
  return day >= 1 && day <= 30 ? day : null;
}

export const DEFAULT_TIDE_REGION_ID = 'dadaepo';

export type TideRegion = {
  id: string;
  label: string;
  area: string;
  /** 국립해양조사원 조석예보 예보지점(조위관측소) 코드 */
  obsCode: string;
  /** API 기준 관측소 표기. 전용 지점이 없으면 가장 가까운 관측소 */
  stationLabel: string;
};

/** 관리자에서 고르는 출조 근거지. 몇물은 음력 기준으로 전국 동일 */
export const TIDE_REGIONS: TideRegion[] = [
  { id: 'dadaepo', label: '부산 다대포', area: '부산', obsCode: 'DT_0005', stationLabel: '부산' },
  { id: 'gamcheon', label: '부산 감천', area: '부산', obsCode: 'DT_0005', stationLabel: '부산' },
  { id: 'yeongdo', label: '부산 영도', area: '부산', obsCode: 'DT_0005', stationLabel: '부산' },
  { id: 'gijang', label: '부산 기장', area: '부산', obsCode: 'DT_0005', stationLabel: '부산' },
  { id: 'haeundae', label: '부산 해운대', area: '부산', obsCode: 'DT_0005', stationLabel: '부산' },
  { id: 'tongyeong', label: '통영', area: '경남', obsCode: 'DT_0014', stationLabel: '통영' },
  { id: 'geoje', label: '거제', area: '경남', obsCode: 'DT_0029', stationLabel: '거제도' },
  { id: 'sacheon', label: '사천', area: '경남', obsCode: 'DT_0061', stationLabel: '삼천포' },
  { id: 'yeosu', label: '여수', area: '전남', obsCode: 'DT_0016', stationLabel: '여수' },
  { id: 'wando', label: '완도', area: '전남', obsCode: 'DT_0027', stationLabel: '완도' },
  { id: 'mokpo', label: '목포', area: '전남', obsCode: 'DT_0007', stationLabel: '목포' },
  { id: 'ulsan', label: '울산', area: '동해', obsCode: 'DT_0020', stationLabel: '울산' },
  { id: 'pohang', label: '포항', area: '동해', obsCode: 'DT_0009', stationLabel: '포항' },
  { id: 'uljin', label: '울진', area: '동해', obsCode: 'DT_0011', stationLabel: '후포' },
  { id: 'gangneung', label: '강릉', area: '동해', obsCode: 'DT_0006', stationLabel: '묵호' },
  { id: 'sokcho', label: '속초', area: '동해', obsCode: 'DT_0012', stationLabel: '속초' },
  { id: 'taean', label: '태안', area: '서해', obsCode: 'DT_0050', stationLabel: '태안' },
  { id: 'boryeong', label: '보령', area: '서해', obsCode: 'DT_0025', stationLabel: '보령' },
  { id: 'gunsan', label: '군산', area: '서해', obsCode: 'DT_0018', stationLabel: '군산' },
  { id: 'incheon', label: '인천', area: '서해', obsCode: 'DT_0001', stationLabel: '인천' },
  { id: 'jeju', label: '제주', area: '제주', obsCode: 'DT_0004', stationLabel: '제주' },
  { id: 'seogwipo', label: '서귀포', area: '제주', obsCode: 'DT_0010', stationLabel: '서귀포' },
];

export function normalizeTideRegionId(value: unknown): string {
  if (typeof value === 'string' && TIDE_REGIONS.some((region) => region.id === value)) {
    return value;
  }
  return DEFAULT_TIDE_REGION_ID;
}

export function getTideRegion(id?: string | null): TideRegion {
  const normalized = normalizeTideRegionId(id);
  return TIDE_REGIONS.find((region) => region.id === normalized) ?? TIDE_REGIONS[0];
}

/** 물때 라벨. 예: 3물, 조금, 사리 */
export function getTideLabel(dateStr: string): string {
  const lunarDay = getKoreanLunarDay(dateStr);
  if (!lunarDay) return '';
  return TIDE_BY_LUNAR_DAY[(lunarDay - 1) % 15];
}

/** @deprecated getTideLabel 사용 */
export function getDadaepoTideLabel(dateStr: string): string {
  return getTideLabel(dateStr);
}

/** 물흐름 세기 1(조금)~8(사리). 음력 15물 주기에서 유도 */
const FLOW_BY_TIDE_LABEL: Record<string, number> = {
  사리: 8,
  '9물': 7,
  '10물': 6,
  '11물': 5,
  '12물': 4,
  '13물': 3,
  '14물': 2,
  조금: 1,
  '1물': 2,
  '2물': 3,
  '3물': 4,
  '4물': 5,
  '5물': 6,
  '6물': 7,
  '7물': 8,
};

export function getTideFlowLevel(label: string): number {
  return FLOW_BY_TIDE_LABEL[label] ?? 0;
}

export function getTideTextColor(label: string, options?: { muted?: boolean }): string {
  if (options?.muted) {
    if (label === '사리') return '#C47A7A';
    if (label === '조금') return '#9A9FA5';
    return '#8AA0C4';
  }
  if (label === '사리') return '#DC2626';
  if (label === '조금') return '#6F767E';
  return '#0F4C81';
}
