export type MemberProfile = {
  isAdmin: boolean;
  totalPoint: number;
  baitCoupons: number;
  createdAt: Date | null;
  profileImageUrl?: string;
  legacyUuid?: string | null;
};
