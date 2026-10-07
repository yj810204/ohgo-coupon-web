import HomeClient from './home-client';
import { getPublicHomeFeed } from '@/lib/public-feed';

export const revalidate = 60;

export default async function MainPage() {
  const initialFeed = await getPublicHomeFeed().catch(() => null);
  return <HomeClient initialFeed={initialFeed} />;
}
