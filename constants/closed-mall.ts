export interface ClosedMallProduct {
  id: string;
  name: string;
  price: string;
  imageUrl?: string;
  memberOnly: boolean;
}

export const CLOSED_MALL_PRODUCTS: ClosedMallProduct[] = [
  {
    id: 'bait-1',
    name: '프리미엄 미끼 세트',
    price: '회원 전용',
    memberOnly: true,
  },
  {
    id: 'gear-1',
    name: '낚시 라인 & 훅 패키지',
    price: '회원 전용',
    memberOnly: true,
  },
  {
    id: 'snack-1',
    name: '승선 도시락 세트',
    price: '회원 전용',
    memberOnly: true,
  },
  {
    id: 'coupon-pack',
    name: '추가 할인 쿠폰 팩',
    price: '스탬프 10개',
    memberOnly: true,
  },
];
