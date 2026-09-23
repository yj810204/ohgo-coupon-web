'use client';

import { useRouter } from '@/hooks/useAppRouter';
import SubPageFrame from '@/components/SubPageFrame';
import TideCalendarScreen from '@/components/trip/TideCalendarScreen';

export default function SampleTidePage() {
  const router = useRouter();
  return (
    <SubPageFrame title="물때·날씨" dense showMyPage={false} onBack={() => router.push('/samples/main')}>
      <TideCalendarScreen tideRegionId="dadaepo" />
    </SubPageFrame>
  );
}
