/**
 * 포트폴리오·샘플 화면용 정적 목 데이터 (API/인증 불필요)
 *
 * 이미지 경로 주의: app/samples/* 라우트와 충돌하지 않도록
 * public/sample-assets/ 또는 public/games/ 아래만 사용한다.
 */

export const SAMPLE_USER = {
  uuid: 'sample-user-001',
  name: '김낚시',
  dob: '900315',
} as const;

export const SAMPLE_ADMIN = {
  uuid: 'sample-admin-001',
  name: '선장 박',
  dob: '850101',
} as const;

/** stamp raw: `YY-MM-DD|METHOD|HH:mm:ss` */
export const SAMPLE_STAMPS: string[] = [
  '26-07-28|QR|07:12:00',
  '26-07-21|ADMIN|06:40:00',
  '26-07-14|QR|07:05:00',
  '26-07-07|QR|06:55:00',
  '26-06-30|ADMIN|07:20:00',
  '26-06-23|QR|07:10:00',
];

export const SAMPLE_COUPONS = [
  {
    id: 'sample-coupon-1',
    reason: '5회 출항 50% 할인',
    issuedAt: '2026-07-28',
    used: false,
    isHalf: 'Y',
  },
  {
    id: 'sample-coupon-2',
    reason: '출항 무료 쿠폰',
    issuedAt: '2026-07-14',
    used: false,
    isHalf: 'N',
  },
  {
    id: 'sample-coupon-3',
    reason: '이벤트 쿠폰',
    issuedAt: '2026-06-01',
    used: true,
    isHalf: 'N',
  },
] as const;

/** 실제 public/games/{id}/thumbnail.png 기반 */
export const SAMPLE_GAMES = [
  {
    game_id: 'match3',
    game_name: '매치3 퍼즐',
    game_description: '같은 블록을 맞춰 포인트를 획득하세요',
    game_path: 'games/match3',
    playPath: '/samples/game/match3',
    thumbnail_url: '/games/match3/thumbnail.png',
    is_active: true,
    display_order: 1,
  },
  {
    game_id: 'bubble_shooter',
    game_name: '버블 슈터',
    game_description: '버블을 맞춰 터뜨리고 랭킹에 도전하세요',
    game_path: 'games/bubble_shooter',
    playPath: '/samples/game/bubble_shooter',
    thumbnail_url: '/games/bubble_shooter/thumbnail.png',
    is_active: true,
    display_order: 2,
  },
  {
    game_id: 'flappy_bird',
    game_name: '플라피 피쉬',
    game_description: '장애물을 피해 최대한 멀리!',
    game_path: 'games/flappy_bird',
    playPath: '/samples/game/flappy_bird',
    thumbnail_url: '/games/flappy_bird/thumbnail.png',
    is_active: true,
    display_order: 3,
  },
];

/**
 * 포트폴리오 캡처용 정적 플레이 스샷 (Phaser 미사용).
 * 실제 게임 썸네일(플레이 화면)을 그대로 쓴다.
 */
export const SAMPLE_GAME_PLAY: Record<string, { src: string; background: string }> = {
  match3: {
    src: '/games/match3/thumbnail.png',
    background: '#f5f5f5',
  },
  bubble_shooter: {
    src: '/games/bubble_shooter/thumbnail.png',
    background: '#add8e6',
  },
  flappy_bird: {
    src: '/games/flappy_bird/thumbnail.png',
    background: '#87ceeb',
  },
};

export const SAMPLE_GAME_NOTICE =
  '미니게임으로 포인트를 모아 포인트몰에서 사용하세요.\n매일 플레이 한도가 있습니다.';

/** 커뮤니티 — 이미지 없음(플레이스홀더). 포트폴리오는 화면 구성만 보여 준다. */
export const SAMPLE_PHOTOS = [
  { id: 'p1', title: '오늘의 조황', subtitle: '사진 준비중', dateLabel: '7월 28일', commentCount: 12 },
  { id: 'p2', title: '참돔 선상', subtitle: '사진 준비중', dateLabel: '7월 21일', commentCount: 8 },
  { id: 'p3', title: '새벽 출항', subtitle: '사진 준비중', dateLabel: '7월 14일', commentCount: 5 },
  { id: 'p4', title: '대물 인증', subtitle: '사진 준비중', dateLabel: '7월 7일', commentCount: 21 },
];

/** 포인트몰 — 이미지 없음 → "이미지 준비중" */
export const SAMPLE_MALL_PRODUCTS = [
  { id: 'prod-1', name: '고등어 미끼 세트', price: '3,000P' },
  { id: 'prod-2', name: '오고피씽 낚시수건', price: '500P' },
  { id: 'prod-3', name: '오고피씽 모자', price: '8,000P' },
  { id: 'prod-4', name: '쿨러백', price: '12,000P' },
];

export const SAMPLE_POINT_BALANCE = {
  gamePoints: 1840,
  communityPoints: 620,
} as const;

function sampleTripDate(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const SAMPLE_TRIPS = [
  {
    id: 'trip-1',
    date: sampleTripDate(1),
    destination: '백령도 인근',
    departureTime: '05:30',
    returnTime: '14:00',
    species: '참돔',
    price: 120000,
  },
  {
    id: 'trip-2',
    date: sampleTripDate(3),
    destination: '연평도',
    departureTime: '06:00',
    returnTime: '15:00',
    species: '우럭',
    price: 100000,
  },
  {
    id: 'trip-3',
    date: sampleTripDate(5),
    destination: '덕적도',
    departureTime: '04:50',
    returnTime: '13:30',
    species: '광어',
    price: 130000,
  },
];

export const SAMPLE_HUB_ITEMS = [
  { href: '/samples/login', label: '로그인', note: '고객 인증' },
  { href: '/samples/main', label: '메인 홈', note: '스탬프·출조·게임' },
  { href: '/samples/stamp', label: '스탬프', note: '적립 내역' },
  { href: '/samples/qr-scan', label: 'QR 리더', note: '스탬프 스캔 UI' },
  { href: '/samples/coupons', label: '쿠폰', note: '발급·사용' },
  { href: '/samples/community', label: '커뮤니티 조황', note: '조황 사진' },
  { href: '/samples/trips', label: '출조 일정', note: '캘린더·리스트' },
  { href: '/samples/point-mall', label: '포인트몰', note: '리워드 상품' },
  { href: '/samples/mini-games', label: '미니게임', note: '게임 목록' },
  { href: '/samples/game/match3', label: '게임 플레이 스샷', note: '정적 썸네일 (Phaser 없음)' },
  { href: '/samples/admin-main', label: '관리자', note: '운영 메뉴' },
] as const;
