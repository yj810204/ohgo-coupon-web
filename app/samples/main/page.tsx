'use client';

import { useRouter } from '@/hooks/useAppRouter';
import AvatarHeader from '@/components/home/AvatarHeader';
import StampCouponSummary from '@/components/home/StampCouponSummary';
import WeeklyTripSummary from '@/components/home/WeeklyTripSummary';
import TripTidePanel from '@/components/trip/TripTidePanel';
import { tripDateToStr } from '@/utils/trip-guide-service';
import SectionHeader from '@/components/home/SectionHeader';
import GridCard from '@/components/home/GridCard';
import FeaturedCard from '@/components/home/FeaturedCard';
import ProductGridCard from '@/components/home/ProductGridCard';
import HorizontalScroll from '@/components/home/HorizontalScroll';
import {
  SAMPLE_GAMES,
  SAMPLE_MALL_PRODUCTS,
  SAMPLE_PHOTOS,
  SAMPLE_STAMPS,
  SAMPLE_COUPONS,
  SAMPLE_TRIPS,
  SAMPLE_USER,
} from '@/lib/samples/mock-data';
import type { TripGuide } from '@/utils/trip-guide-service';

export default function SampleMainPage() {
  const router = useRouter();
  const stampCount = SAMPLE_STAMPS.length;
  const couponCount = SAMPLE_COUPONS.filter((c) => !c.used).length;

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          paddingBottom: 32,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}
      >
        <div className="px-3 pt-2" style={{ maxWidth: 480, margin: '0 auto' }}>
          <AvatarHeader userName={SAMPLE_USER.name} onMyPage={() => undefined} />
        </div>
      </div>

      <div className="px-3" style={{ maxWidth: 480, margin: '0 auto', marginTop: -24 }}>
        <div className="mb-4">
          <StampCouponSummary
            stampCount={stampCount}
            couponCount={couponCount}
            onStampClick={() => router.push('/samples/stamp')}
            onCouponClick={() => router.push('/samples/coupons')}
            onQrScan={() => router.push('/samples/qr-scan')}
          />
        </div>

        <WeeklyTripSummary
          trips={SAMPLE_TRIPS as TripGuide[]}
          onViewAll={() => router.push('/samples/trips')}
        />

        <TripTidePanel
          date={tripDateToStr()}
          tideRegionId="dadaepo"
          onViewAll={() => router.push('/samples/tide')}
        />

        <section className="mb-4">
          <SectionHeader title="커뮤니티" onViewAll={() => router.push('/samples/community')} />
          <div className="row g-3">
            {SAMPLE_PHOTOS.map((p) => (
              <div key={p.id} className="col-6">
                <GridCard
                  title={p.title}
                  subtitle={p.subtitle}
                  onClick={() => router.push('/samples/community')}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <SectionHeader title="미니게임" onViewAll={() => router.push('/samples/mini-games')} />
          <HorizontalScroll
            className="d-flex gap-3 overflow-auto pb-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {SAMPLE_GAMES.map((game, i) => (
              <FeaturedCard
                key={game.game_id}
                title={game.game_name}
                imageUrl={game.thumbnail_url}
                badge={i === 0 ? '인기' : undefined}
                onClick={() => router.push(game.playPath ?? '/samples/mini-games')}
              />
            ))}
          </HorizontalScroll>
        </section>

        <section className="mb-2">
          <SectionHeader
            title="Oh~Go! 포인트몰"
            badge={
              <span
                className="badge rounded-pill"
                style={{ backgroundColor: '#1B6FF5', fontSize: '10px' }}
              >
                포인트 사용
              </span>
            }
            onViewAll={() => router.push('/samples/point-mall')}
          />
          <div className="row g-3">
            {SAMPLE_MALL_PRODUCTS.map((product) => (
              <div key={product.id} className="col-6">
                <ProductGridCard
                  product={{
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    memberOnly: false,
                  }}
                  onClick={() => router.push('/samples/point-mall')}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
