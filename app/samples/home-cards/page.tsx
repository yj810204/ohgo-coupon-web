'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TripTidePanel from '@/components/trip/TripTidePanel';
import WindWeatherCard from '@/components/trip/WindWeatherCard';
import {
  PictogramSectionHeader,
  SectionPictogram,
  WindMark,
} from '@/components/trip/ForecastPictograms';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function HomeCards({ date }: { date: string }) {
  const [chartDate, setChartDate] = useState(date);

  return (
    <div style={{ backgroundColor: '#F7F8FA', minHeight: '100vh' }}>
      <div className="px-3" style={{ maxWidth: 480, margin: '16px auto 32px' }}>
        <div data-shot="tide">
          <TripTidePanel
            date={chartDate}
            tideRegionId="dadaepo"
            onActiveDate={setChartDate}
            viewAllHref="/samples/tide"
          />
        </div>
        <section data-shot="wind" style={{ marginBottom: 30 }}>
          <PictogramSectionHeader
            title="바람"
            viewAllHref="/samples/tide"
            icon={
              <SectionPictogram>
                <WindMark />
              </SectionPictogram>
            }
          />
          <WindWeatherCard date={chartDate} onActiveDate={setChartDate} spaced={false} />
        </section>
      </div>
    </div>
  );
}

function HomeCardsFromQuery() {
  const queryDate = useSearchParams().get('date');
  const date = queryDate && DATE_RE.test(queryDate) ? queryDate : '2026-10-14';
  return <HomeCards key={date} date={date} />;
}

/** 홈 물때·바람 카드만 보여주는 캡처용 화면. 날짜는 ?date=YYYY-MM-DD */
export default function HomeCardsShotPage() {
  return (
    <Suspense fallback={null}>
      <HomeCardsFromQuery />
    </Suspense>
  );
}
