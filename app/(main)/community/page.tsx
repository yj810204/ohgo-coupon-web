import CommunityPage from './community-view';
import { getPublicCommunityCounts } from '@/lib/public-feed';

export const revalidate = 60;

export default async function Page() {
  const initialCounts = await getPublicCommunityCounts().catch(() => null);
  return <CommunityPage initialCounts={initialCounts} />;
}
