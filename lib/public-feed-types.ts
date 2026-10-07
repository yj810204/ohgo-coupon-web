import type { CommunityPhoto } from '@/utils/community-service.shared';
import type { TripGuide } from '@/utils/trip-guide-shared';

export type PublicHomeFeed = {
  photos: CommunityPhoto[];
  faq: CommunityPhoto[];
  qna: CommunityPhoto[];
  weekTrips: TripGuide[];
};

export type PublicCommunityCounts = {
  photos: number;
  faq: number;
  qna: number;
};
