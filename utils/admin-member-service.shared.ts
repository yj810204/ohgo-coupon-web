export type AdminMember = {
  id: string;
  uuid: string;
  name: string;
  dob: string;
  createdAt: string;
  lastStampTimeMs?: number;
  profileImageUrl?: string;
  gender?: string | null;
  tripCount?: number;
  couponCount?: number;
  halfCouponCount?: number;
  fullCouponCount?: number;
  stampCount?: number;
  hasMemo?: boolean;
  hasBoarding?: boolean;
  /** 승선명부 uuidv5 비회원 (OAuth 미가입) */
  isGuest?: boolean;
  phone?: string | null;
};

export type AdminMemberStats = {
  couponCount: number;
  halfCouponCount: number;
  fullCouponCount: number;
  stampCount: number;
  hasMemo: boolean;
  hasBoarding: boolean;
  gender: string | null;
  tripCount: number;
};
