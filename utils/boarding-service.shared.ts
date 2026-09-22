export interface BoardingFormData {
  name: string;
  birth: string;
  gender: string;
  phone: string;
  emergency: string;
  address: string;
  addressDetail?: string;
  agreed: boolean;
  agreedThirdParty: boolean;
  tripRole?: string;
}

export interface BoardingFormRecord extends BoardingFormData {
  userId: string;
}

/** 예약·스탬프와 동일: 이름+연락처가 있어야 승선정보 작성 완료로 본다. */
export function isBoardingComplete(record: BoardingFormRecord | null | undefined): boolean {
  return Boolean(record?.name?.trim() && record?.phone?.trim());
}
