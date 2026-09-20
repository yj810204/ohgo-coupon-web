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
  /** 구앱/승선명부 uuidv5 회원 (앱 미가입) */
  isGuest?: boolean;
  phone?: string | null;
  /** 회원 중 구앱 legacy_uuid 연결됨 */
  isLegacyLinked?: boolean;
  /** 다른 회원으로 통합된 문서 */
  mergedTo?: string | null;
  role?: string | null;
};

export type DuplicateMemberCandidate = {
  uuid: string;
  name: string;
  dob: string;
  lastStampTimeMs?: number;
  stampCount: number;
  tripCount: number;
};

export type AdminGuestDetail = {
  id: string;
  name: string;
  dob: string;
  phone: string | null;
  createdAt: string;
  mergedTo: string | null;
  boarding: {
    name: string | null;
    birth: string | null;
    gender: string | null;
    phone: string | null;
    emergency: string | null;
    address: string | null;
    addressDetail: string | null;
  } | null;
  stampCount: number;
  couponCount: number;
  halfCouponCount: number;
  fullCouponCount: number;
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
