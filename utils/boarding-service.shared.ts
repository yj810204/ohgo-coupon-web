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
