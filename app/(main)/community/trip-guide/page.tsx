import TripGuidePage from './trip-guide-client';
import { getPublicMonthTrips } from '@/lib/public-feed';

export const revalidate = 60;

function kstYearMonth() {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  return ymd.slice(0, 7);
}

export default async function Page() {
  const initialTrips = await getPublicMonthTrips(kstYearMonth()).catch(() => null);
  return <TripGuidePage initialTrips={initialTrips} />;
}
