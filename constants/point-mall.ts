/** 포인트몰 상품 타입 (Firestore pointMallProducts) */
export interface PointMallProduct {
  id: string;
  name: string;
  description: string;
  pointPrice: number;
  /** 대표 이미지 (하위 호환, imageUrls[0]과 동일) */
  imageUrl?: string;
  /** 상품 이미지 목록 */
  imageUrls?: string[];
  stock: number;
  isActive: boolean;
  order: number;
  createdAt?: Date;
  /** 미끼 상품 여부 (커뮤니티 포인트 전용 구매) */
  isBaitProduct?: boolean;
  /** 구매 시 지급되는 미끼 수량 */
  baitAmount?: number;
}

/** 상품 이미지 URL 목록 (imageUrls 우선, 없으면 imageUrl) */
export function getProductImageUrls(
  product: Pick<PointMallProduct, 'imageUrl' | 'imageUrls'>
): string[] {
  if (product.imageUrls?.length) {
    return product.imageUrls.filter(u => !!u?.trim());
  }
  const single = product.imageUrl?.trim();
  return single ? [single] : [];
}

/** 목록·카드용 대표 이미지 */
export function getProductPrimaryImageUrl(
  product: Pick<PointMallProduct, 'imageUrl' | 'imageUrls'>
): string | undefined {
  return getProductImageUrls(product)[0];
}

export type PointMallProductInput = Omit<PointMallProduct, 'id' | 'createdAt'>;

/** 관리자 최초 등록 참고용 기본 상품 (Firestore 비어 있을 때 참고) */
export const DEFAULT_POINT_MALL_SEED: PointMallProductInput[] = [
  {
    name: '프리미엄 미끼 세트',
    description: '커뮤니티 활동으로 모은 포인트로 교환하는 미끼 세트입니다.',
    pointPrice: 500,
    stock: -1,
    isActive: true,
    order: 1,
    isBaitProduct: true,
    baitAmount: 1,
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

export function formatProductStock(stock: number): string {
  if (stock === 0) return '품절';
  if (stock < 0) return '재고 무제한';
  return `재고 ${stock.toLocaleString('ko-KR')}개`;
}

export function purchaseErrorMessage(
  code:
    | 'USER_NOT_FOUND'
    | 'PRODUCT_NOT_FOUND'
    | 'PRODUCT_INACTIVE'
    | 'OUT_OF_STOCK'
    | 'INSUFFICIENT_POINTS'
    | 'COMMUNITY_POINT_ONLY'
    | 'INVALID_BAIT_PRODUCT'
    | 'UNKNOWN'
): string {
  switch (code) {
    case 'INSUFFICIENT_POINTS':
      return '포인트가 부족합니다.';
    case 'COMMUNITY_POINT_ONLY':
      return '이 상품은 커뮤니티 포인트로만 구매할 수 있습니다. 댓글 등 커뮤니티 활동으로 포인트를 모아 주세요.';
    case 'INVALID_BAIT_PRODUCT':
      return '미끼 상품 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.';
    case 'OUT_OF_STOCK':
      return '재고가 없습니다.';
    case 'PRODUCT_INACTIVE':
      return '판매 중지된 상품입니다.';
    case 'PRODUCT_NOT_FOUND':
      return '상품을 찾을 수 없습니다.';
    default:
      return '구매 중 오류가 발생했습니다.';
  }
}
