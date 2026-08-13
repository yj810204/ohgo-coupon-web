export type CaptainPhotoTag = {
  id: string;
  photoId: string;
  userId: string | null;
  userName: string;
  seatNo?: number;
};

export type CaptainPhoto = {
  id: string;
  captainId: string;
  imageUrls: string[];
  species?: string;
  tripDate: string;
  createdAt: string;
  tags?: CaptainPhotoTag[];
};

export type PassengerTagInput = {
  userId: string | null;
  userName: string;
  seatNo?: number;
};

export type UploadCaptainPhotoInput = {
  captainId: string;
  files: File[];
  tripDate: string;
  species?: string;
};
