'use client';

import { useEffect, useCallback, useState } from 'react';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import { getStamps, getCouponCount } from '@/utils/stamp-service';
import { getPhotos, type CommunityPhoto } from '@/utils/community-service';
import { getActiveGames, type Game } from '@/lib/game-service';
import { useNavigation } from '@/hooks/useNavigation';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import AvatarHeader from '@/components/home/AvatarHeader';
import StampCouponSummary from '@/components/home/StampCouponSummary';
import SectionHeader from '@/components/home/SectionHeader';
import GridCard from '@/components/home/GridCard';
import FeaturedCard from '@/components/home/FeaturedCard';
import ProductGridCard from '@/components/home/ProductGridCard';
import WeeklyTripSummary from '@/components/home/WeeklyTripSummary';
import { getPointMallProducts } from '@/utils/point-mall-service';
import { formatPointPrice } from '@/constants/point-mall';
import type { PointMallProduct } from '@/constants/point-mall';
import { format } from 'date-fns';
import { IoGameControllerOutline, IoStorefrontOutline } from 'react-icons/io5';
import EmptyState from '@/components/EmptyState';

export default function MainPage() {
  const { navigate, navigateReplace } = useNavigation();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ uuid?: string; name?: string; dob?: string } | null>(null);
  const [stampCount, setStampCount] = useState(0);
  const [couponCount, setCouponCount] = useState(0);
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [mallProducts, setMallProducts] = useState<PointMallProduct[]>([]);

  const loadRemoteData = useCallback(async (uuid: string) => {
    try {
      const [stamps, coupons, photoList, activeGames, pointProducts] = await Promise.all([
        getStamps(uuid),
        getCouponCount(uuid),
        getPhotos(4),
        getActiveGames(),
        getPointMallProducts(),
      ]);
      setStampCount(stamps.length);
      setCouponCount(coupons);
      setPhotos(photoList);
      setGames(activeGames);
      setMallProducts(pointProducts.slice(0, 4));
    } catch (error) {
      console.error('Error loading home data:', error);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const localUser = await getUser();
      if (!localUser?.uuid) {
        navigateReplace('/login');
        return;
      }

      // 로컬 유저로 즉시 화면 표시 (Firestore 응답 대기 안 함)
      setUser(localUser);
      setLoading(false);

      // 백그라운드에서 원격 유저 검증 및 데이터 로딩
      void (async () => {
        try {
          const remoteUser = await getUserByUUID(localUser.uuid!);
          if (!remoteUser) {
            navigateReplace('/login');
            return;
          }
          if (remoteUser.isAdmin) {
            navigateReplace('/admin-main');
            return;
          }
        } catch (err) {
          console.warn('Remote user check failed:', err);
        }
        void loadRemoteData(localUser.uuid!);
      })();
    } catch (error) {
      console.error('handleRefresh error:', error);
      setLoading(false);
    }
  }, [navigateReplace, loadRemoteData]);

  useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const onPullRefresh = useCallback(async () => {
    const localUser = await getUser();
    if (!localUser?.uuid) {
      await handleRefresh();
      return;
    }
    setUser(localUser);
    await loadRemoteData(localUser.uuid);
  }, [handleRefresh, loadRemoteData]);

  useNativePullToRefresh(onPullRefresh);

  const photoTitle = (photo: CommunityPhoto) =>
    photo.title || photo.uploadedByName || '조황 사진';

  const photoDate = (photo: CommunityPhoto) => {
    const raw = photo.uploadedAt;
    const d =
      raw instanceof Date
        ? raw
        : raw && typeof (raw as { toDate?: () => Date }).toDate === 'function'
          ? (raw as { toDate: () => Date }).toDate()
          : new Date(String(raw));
    try {
      return format(d, 'MM.dd');
    } catch {
      return '';
    }
  };

  const DUMMY_PHOTOS = [
    { photoId: 'dummy-1', title: '오늘의 조황', subtitle: '사진 준비중' },
    { photoId: 'dummy-2', title: '선상 낚시 후기', subtitle: '사진 준비중' },
    { photoId: 'dummy-3', title: '대물 낚시 현장', subtitle: '사진 준비중' },
    { photoId: 'dummy-4', title: '조황 정보 공유', subtitle: '사진 준비중' },
  ];
  const isPhotoDummy = photos.length === 0;

  const gameImage = (game: Game) => game.thumbnail_url || undefined;

  if (loading || !user?.uuid) {
    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: '#F7F8FA' }}
      >
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status" />
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  const query = `uuid=${user.uuid}&name=${encodeURIComponent(user.name || '')}&dob=${user.dob || ''}`;

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA' }}>
      <div className="px-3 pt-2" style={{ maxWidth: 480, margin: '0 auto' }}>
        <AvatarHeader
          userName={user.name || '회원'}
          onMyPage={() => navigate('/my-page')}
        />

        <div className="mb-4">
          <StampCouponSummary
            stampCount={stampCount}
            couponCount={couponCount}
            onStampClick={() => navigate(`/stamp?${query}`)}
            onCouponClick={() => navigate(`/coupons?${query}`)}
            onQrScan={() => navigate(`/qr-scan?${query}`)}
          />
        </div>

        <WeeklyTripSummary onViewAll={() => navigate('/community/trip-guide')} />

        <section className="mb-4">
          <SectionHeader
            title="커뮤니티"
            onViewAll={() => navigate('/community/photos')}
          />
          <div className="row g-3">
            {isPhotoDummy
              ? DUMMY_PHOTOS.map((p) => (
                  <div key={p.photoId} className="col-6">
                    <GridCard
                      title={p.title}
                      subtitle={p.subtitle}
                    />
                  </div>
                ))
              : photos.map((photo) => (
                  <div key={photo.photoId} className="col-6">
                    <GridCard
                      title={photoTitle(photo)}
                      subtitle={photoDate(photo)}
                      imageUrl={photo.imageUrls?.[0] || photo.imageUrl}
                      onClick={() => navigate(`/community/${photo.photoId}`)}
                    />
                  </div>
                ))}
          </div>
        </section>

        <section className="mb-4">
          <SectionHeader title="미니게임" onViewAll={() => navigate('/mini-games')} />
          {games.length === 0 ? (
            <EmptyState
              icon={IoGameControllerOutline}
              message="준비 중인 게임이 없습니다"
              compact
              style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            />
          ) : (
            <div
              className="d-flex gap-3 overflow-auto pb-1"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {games.map((game, i) => (
                <FeaturedCard
                  key={game.game_id}
                  title={game.game_name}
                  imageUrl={gameImage(game)}
                  badge={i === 0 ? '인기' : undefined}
                  onClick={() => navigate(`/mini-games/${game.game_id}`)}
                />
              ))}
            </div>
          )}
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
            onViewAll={() => navigate('/point-mall')}
          />
          {mallProducts.length === 0 ? (
            <EmptyState
              icon={IoStorefrontOutline}
              message="등록된 상품이 없습니다"
              compact
              style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            />
          ) : (
            <div className="row g-3">
              {mallProducts.map((product) => (
                <div key={product.id} className="col-6">
                  <ProductGridCard
                    product={{
                      id: product.id,
                      name: product.name,
                      price: product.stock === 0 ? '품절' : formatPointPrice(product.pointPrice),
                      imageUrl: product.imageUrl,
                      memberOnly: false,
                    }}
                    onClick={() => navigate('/point-mall')}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
