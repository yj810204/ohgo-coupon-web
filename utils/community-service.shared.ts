export interface CommunityPhoto {
  photoId: string;
  imageUrl: string;
  imageUrls?: string[];
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Date | string;
  title?: string;
  description?: string;
  content?: string;
  photoDate?: Date | string;
  templateId?: string;
  templateFieldValues?: Record<string, string | string[]>;
  commentCount: number;
}

export interface Comment {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date | string;
  pointAwarded: number;
}
