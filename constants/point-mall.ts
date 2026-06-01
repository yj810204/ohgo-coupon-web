/** 포인트몰 상품 타입 (Firestore pointMallProducts) */
export interface PointMallProduct {
  id: string;
  name: string;
  description: string;
  pointPrice: number;
  imageUrl?: string;
  stock: number;
  isActive: boolean;
  order: number;
  createdAt?: Date;
}

export type PointMallProductInput = Omit<PointMallProduct, 'id' | 'createdAt'>;

/** 관리자 최초 등록 참고용 기본 상품 (Firestore 비어 있을 때 참고) */
export const DEFAULT_POINT_MALL_SEED: PointMallProductInput[] = [
  {
    name: '프리미엄 미끼 세트',
    description: '게임·커뮤니티 활동으로 모은 포인트로 교환하는 미끼 세트입니다.',
    pointPrice: 500,
    stock: -1,
    isActive: true,
    order: 1,
  },
  {
    name: '낚시 라인 & 훅 패키지',
    description: '라인과 훅이 함께 구성된 실속 패키지입니다.',
    pointPrice: 800,
    stock: -1,
    isActive: true,
    order: 2,
  },
  {
    name: '승선 도시락 세트',
    description: '출조 당일 사용 가능한 도시락 세트입니다.',
    pointPrice: 1200,
    stock: 20,
    isActive: true,
    order: 3,
  },
  {
    name: '추가 할인 쿠폰 팩',
    description: '매장에서 사용 가능한 할인 쿠폰 팩입니다.',
    pointPrice: 1000,
    stock: 10,
    isActive: true,
    order: 4,
  },
];

export function formatPointPrice(points: number): string {
  return `${points.toLocaleString('ko-KR')}P`;
}
