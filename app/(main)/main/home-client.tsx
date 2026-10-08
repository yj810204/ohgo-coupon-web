'use client';

import { useEffect, useCallback, useRef, useState, Fragment } from 'react';
import { getUser } from '@/lib/storage';
import { resolveAppUser, peekAppUser } from '@/lib/auth-session';
import { isDevAuthBypass } from '@/lib/dev-auth';
import { COMMUNITY_POST_DELETED_MESSAGE, type CommunityPhoto } from '@/utils/community-service.shared';
import type { CaptainPhoto } from '@/utils/captain-photo-service.shared';
import type { Game } from '@/lib/game-service.shared';
import { useNavigation } from '@/hooks/useNavigation';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import AvatarHeader from '@/components/home/AvatarHeader';
import StampCouponSummary from '@/components/home/StampCouponSummary';
import SectionHeader from '@/components/home/SectionHeader';
import GridCard from '@/components/home/GridCard';
import CommunityPhotoCard from '@/components/community/CommunityPhotoCard';
import QnaListItem from '@/components/community/QnaListItem';
import FeaturedCard from '@/components/home/FeaturedCard';
import HorizontalScroll from '@/components/home/HorizontalScroll';
import WeeklyTripSummary from '@/components/home/WeeklyTripSummary';
import TripTidePanel from '@/components/trip/TripTidePanel';
import WindWeatherCard from '@/components/trip/WindWeatherCard';
import {
  PictogramSectionHeader,
  SectionPictogram,
  WindMark,
} from '@/components/trip/ForecastPictograms';
import MarketListingCard from '@/components/market/MarketListingCard';
import {
  getWeekRange,
  tripDateToStr,
  type TripGuide,
} from '@/utils/trip-guide-shared';
import type { MarketListing } from '@/utils/market-service.shared';
import { displayMemberName, formatPhotoCardDate } from '@/lib/mask-member-name';
import {
  DEFAULT_HOME_SECTIONS,
  DEFAULT_HOME_SECTION_ORDER,
  normalizeHomeSectionOrder,
  type HomeSectionId,
  type HomeSectionVisibility,
} from '@/utils/site-settings-shared';
import {
  categoryLabel,
  type BoardCategory,
} from '@/utils/board-category-service';
import { IoBookOutline, IoGameControllerOutline, IoHelpCircleOutline, IoStorefrontOutline } from 'react-icons/io5';
import EmptyState from '@/components/EmptyState';
import { OHGO_CARD, OHGO_LIST_DIVIDER, OhgoPageLoading } from '@/lib/page-styles';
import type { PublicHomeFeed } from '@/lib/public-feed-types';
import { peekCache, subscribeCache } from '@/lib/query-cache';
import { TimeoutError } from '@/lib/with-timeout';
import {
  applyStampCacheEvent,
  applyStampCouponLoad,
  couponCountCacheKey,
  shouldRetryStampLoad,
  stampListCacheKey,
  stampLoadFailed,
  type StampCouponCounts,
} from '@/lib/stamp-count-state';

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default function MainPage({ initialFeed = null }: { initialFeed?: PublicHomeFeed | null }) {
  const { navigate, navigateReplace } = useNavigation();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{
    uuid?: string;
    name?: string;
    dob?: string;
    isAdmin?: boolean;
    isCaptain?: boolean;
  } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stampCounts, setStampCounts] = useState<StampCouponCounts>({ stamps: null, coupons: null });
  const stampLoad = useRef({ attempts: 0, failed: false });
  const loadSeq = useRef(0);
  const [photos, setPhotos] = useState<CommunityPhoto[]>(initialFeed?.photos ?? []);
  const [faqPosts, setFaqPosts] = useState<CommunityPhoto[]>(initialFeed?.faq ?? []);
  const [qnaPosts, setQnaPosts] = useState<CommunityPhoto[]>(initialFeed?.qna ?? []);
  const [faqCategories, setFaqCategories] = useState<BoardCategory[]>([]);
  const [qnaCategories, setQnaCategories] = useState<BoardCategory[]>([]);
  const [myCaptainPhotos, setMyCaptainPhotos] = useState<CaptainPhoto[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [marketListings, setMarketListings] = useState<MarketListing[]>([]);
  const [weekTrips, setWeekTrips] = useState<TripGuide[]>(initialFeed?.weekTrips ?? []);
  const [weekTripsLoading, setWeekTripsLoading] = useState(!initialFeed);
  const [chartDate, setChartDate] = useState(() => tripDateToStr());
  const [homeSections, setHomeSections] = useState<HomeSectionVisibility>({
    ...DEFAULT_HOME_SECTIONS,
  });
  const [homeSectionOrder, setHomeSectionOrder] = useState<HomeSectionId[]>([
    ...DEFAULT_HOME_SECTION_ORDER,
  ]);

  const applyHomeLayout = (settings: {
    homeSections: HomeSectionVisibility;
    homeSectionOrder?: HomeSectionId[];
  }) => {
    setHomeSections(settings.homeSections);
    setHomeSectionOrder(normalizeHomeSectionOrder(settings.homeSectionOrder));
  };

  const loadRemoteData = useCallback(async (
    uuid: string,
    sections?: HomeSectionVisibility,
    order?: HomeSectionId[]
  ) => {
    // Supabase 미연결 개발 우회: 빈 섹션으로 홈 UI만 탐색
    if (isDevAuthBypass()) return;

    let visibility = sections;
    let sectionOrder = order;
    if (!visibility || !sectionOrder) {
      const { getSiteSettings } = await import('@/utils/site-settings-service');
      const settings = await getSiteSettings();
      visibility = visibility ?? settings.homeSections;
      sectionOrder = sectionOrder ?? settings.homeSectionOrder;
    }
    if (!visibility || !sectionOrder) return;
    applyHomeLayout({ homeSections: visibility, homeSectionOrder: sectionOrder });

    const seq = ++loadSeq.current;
    const weekRange = getWeekRange(new Date());
    const [
      stampsApi,
      communityApi,
      gamesApi,
      marketApi,
      captainApi,
      profileApi,
      tripsApi,
      boardApi,
    ] = await Promise.all([
      import('@/utils/stamp-service'),
      import('@/utils/community-service'),
      import('@/lib/game-service'),
      import('@/utils/market-service'),
      import('@/utils/captain-photo-service'),
      import('@/utils/member-profile-service'),
      import('@/utils/trip-guide-service'),
      import('@/utils/board-category-service'),
    ]);
    const [stamps, coupons, photoList, faqList, qnaList, faqCats, qnaCats, activeGames, marketItems, taggedPhotos, avatar, trips] =
      await Promise.allSettled([
        visibility.stampCoupon ? stampsApi.getStamps(uuid) : Promise.resolve([]),
        visibility.stampCoupon ? stampsApi.getCouponCount(uuid) : Promise.resolve(0),
        visibility.community ? communityApi.getPhotos(4) : Promise.resolve([]),
        visibility.community ? communityApi.getPhotos(3, 'faq') : Promise.resolve([]),
        visibility.community ? communityApi.getPhotos(3, 'qna') : Promise.resolve([]),
        visibility.community ? boardApi.getBoardCategories('faq', { includeInactive: true }) : Promise.resolve([]),
        visibility.community ? boardApi.getBoardCategories('qna', { includeInactive: true }) : Promise.resolve([]),
        visibility.miniGames ? gamesApi.getActiveGames() : Promise.resolve([]),
        visibility.market ? marketApi.getApprovedListings() : Promise.resolve([]),
        visibility.myPhotos ? captainApi.getPhotosForUser(uuid) : Promise.resolve([]),
        profileApi.getAvatarPublicUrl(uuid),
        visibility.weeklyTrip
          ? tripsApi.getTripsInDateRange(tripDateToStr(weekRange.start), tripDateToStr(weekRange.end))
          : Promise.resolve([]),
      ]);

    if (seq !== loadSeq.current) return;

    const stampResult = {
      stamps: stamps as PromiseSettledResult<string[]>,
      coupons: coupons as PromiseSettledResult<number>,
    };
    setStampCounts((prev) => applyStampCouponLoad(prev, stampResult));
    const failed = stampLoadFailed(stampResult);
    stampLoad.current.failed = failed;
    if (!failed) stampLoad.current.attempts = 0;
    else if (shouldRetryStampLoad(stampLoad.current)) {
      stampLoad.current.attempts += 1;
      window.setTimeout(() => {
        void loadRemoteData(uuid).catch((error) => {
          console.error('stamp retry failed:', error);
        });
      }, 1200);
    }
    setPhotos(settledValue(photoList, []));
    setFaqPosts(settledValue(faqList, []));
    setQnaPosts(settledValue(qnaList, []));
    setFaqCategories(settledValue(faqCats, []));
    setQnaCategories(settledValue(qnaCats, []));
    setMyCaptainPhotos(settledValue(taggedPhotos, []));
    setGames(settledValue(activeGames, []));
    setMarketListings(settledValue(marketItems, []).slice(0, 4));
    setAvatarUrl(settledValue(avatar, null));
    setWeekTrips(settledValue(trips, []));
    setWeekTripsLoading(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      const { getSiteSettings } = await import('@/utils/site-settings-service');
      const settingsPromise = getSiteSettings();
      const peeked = peekAppUser();
      const cached = peeked
        ? { uuid: peeked.uuid, name: peeked.name, dob: peeked.dob, isAdmin: peeked.isAdmin }
        : await getUser();
      if (cached?.uuid) {
        const settings = await settingsPromise;
        applyHomeLayout(settings);
        setUser({
          uuid: cached.uuid,
          name: cached.name,
          dob: cached.dob,
          isAdmin: cached.isAdmin,
        });
        setLoading(false);
      } else {
        setLoading(true);
      }

      const [appUser, settings] = await Promise.all([resolveAppUser(), settingsPromise]);
      if (!appUser) {
        navigateReplace('/login');
        return;
      }

      applyHomeLayout(settings);
      setUser({
        uuid: appUser.uuid,
        name: appUser.name,
        dob: appUser.dob,
        isAdmin: appUser.isAdmin,
        isCaptain: appUser.isCaptain,
      });
      setLoading(false);
      await loadRemoteData(appUser.uuid, settings.homeSections, settings.homeSectionOrder);
    } catch (error) {
      console.error('handleRefresh error:', error);
      setLoading(false);
    }
  }, [navigateReplace, loadRemoteData]);

  useEffect(() => {
    void handleRefresh();
  }, [handleRefresh]);

  useEffect(() => {
    const uuid = user?.uuid;
    if (!uuid) return;
    const applyCached = (key: string, value: unknown, error?: unknown) => {
      if (error && !(error instanceof TimeoutError)) stampLoad.current.failed = true;
      setStampCounts((prev) => {
        const next = applyStampCacheEvent(uuid, prev, key, value, error);
        if (!error && next.stamps != null && next.coupons != null) {
          stampLoad.current.failed = false;
          stampLoad.current.attempts = 0;
        }
        return next;
      });
    };
    const unsubscribe = subscribeCache(applyCached);
    const cachedList = peekCache<string[]>(stampListCacheKey(uuid));
    if (cachedList) applyCached(stampListCacheKey(uuid), cachedList);
    const cachedCoupons = peekCache<number>(couponCountCacheKey(uuid));
    if (typeof cachedCoupons === 'number') applyCached(couponCountCacheKey(uuid), cachedCoupons);
    return unsubscribe;
  }, [user?.uuid]);

  useEffect(() => {
    const uuid = user?.uuid;
    if (!uuid) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!shouldRetryStampLoad(stampLoad.current)) return;
      stampLoad.current.attempts += 1;
      void loadRemoteData(uuid).catch((error) => {
        console.error('stamp retry failed:', error);
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.uuid, loadRemoteData]);

  const onPullRefresh = useCallback(async () => {
    const appUser = await resolveAppUser();
    if (!appUser?.uuid) {
      await handleRefresh();
      return;
    }
    setUser({
      uuid: appUser.uuid,
      name: appUser.name,
      dob: appUser.dob,
      isAdmin: appUser.isAdmin,
      isCaptain: appUser.isCaptain,
    });
    await loadRemoteData(appUser.uuid);
  }, [handleRefresh, loadRemoteData]);

  useNativePullToRefresh(onPullRefresh);

  const canSeeFullNames = Boolean(user?.isAdmin || user?.isCaptain);

  const DUMMY_PHOTOS = [
    { photoId: 'dummy-1', title: '오늘의 조황', subtitle: '사진 준비중' },
    { photoId: 'dummy-2', title: '선상 낚시 후기', subtitle: '사진 준비중' },
    { photoId: 'dummy-3', title: '대물 낚시 현장', subtitle: '사진 준비중' },
    { photoId: 'dummy-4', title: '조황 정보 공유', subtitle: '사진 준비중' },
  ];
  const isPhotoDummy = photos.length === 0;

  const gameImage = (game: Game) => game.thumbnail_url || undefined;

  if (loading || !user?.uuid) {
    return <OhgoPageLoading />;
  }

  const query = `uuid=${user.uuid}&name=${encodeURIComponent(user.name || '')}&dob=${user.dob || ''}`;

  const stampOverlapsHeader =
    homeSectionOrder.find((id) => {
      if (!homeSections[id]) return false;
      if (id === 'myPhotos') return myCaptainPhotos.length > 0;
      return true;
    }) === 'stampCoupon';

  return (
    <div className="min-vh-100 pb-4" style={{ backgroundColor: '#F7F8FA' }}>

      {/* 흰색 헤더 영역 */}
      <div
        style={{
          backgroundColor: '#ffffff',
          paddingBottom: stampOverlapsHeader ? 32 : 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}
      >
        <div className="px-3 pt-2" style={{ maxWidth: 480, margin: '0 auto' }}>
          <AvatarHeader
            userName={user.name || '회원'}
            avatarUrl={avatarUrl}
            myPageHref="/my-page"
          />
        </div>
      </div>

      {/* 카드가 헤더 위로 -24px 겹침 */}
      <div
        className="px-3"
        style={{
          maxWidth: 480,
          margin: '0 auto',
          marginTop: stampOverlapsHeader ? -24 : 16,
        }}
      >
        {homeSectionOrder.map((sectionId) => {
          if (sectionId === 'stampCoupon' && homeSections.stampCoupon) {
            return (
              <div key={sectionId} style={{ marginBottom: 30 }}>
                <StampCouponSummary
                  stampCount={stampCounts.stamps}
                  couponCount={stampCounts.coupons}
                  stampHref={`/stamp?${query}`}
                  couponHref={`/coupons?${query}`}
                  onQrScan={async () => {
                    if (!user?.uuid) return false;
                    const { confirmBoardingForStampScan } = await import('@/lib/stamps/confirm-boarding-for-scan');
                    const gate = await confirmBoardingForStampScan(user.uuid);
                    if (gate === 'go_form') navigate('/boarding-form');
                    if (gate !== 'ok') return false;
                    navigate(`/qr-scan?${query}`);
                    return true;
                  }}
                />
              </div>
            );
          }

          if (sectionId === 'weeklyTrip' && homeSections.weeklyTrip) {
            return (
              <WeeklyTripSummary
                key={sectionId}
                viewAllHref="/community/trip-guide"
                trips={weekTrips}
                isLoading={weekTripsLoading}
              />
            );
          }

          if (sectionId === 'tide' && homeSections.tide) {
            return (
              <TripTidePanel
                key={sectionId}
                date={chartDate}
                onActiveDate={setChartDate}
                viewAllHref="/tide"
              />
            );
          }

          if (sectionId === 'wind' && homeSections.wind) {
            return (
              <section key={sectionId} style={{ marginBottom: 30 }}>
                <PictogramSectionHeader
                  title="바람"
                  viewAllHref="/tide"
                  icon={
                    <SectionPictogram>
                      <WindMark />
                    </SectionPictogram>
                  }
                />
                <WindWeatherCard date={chartDate} onActiveDate={setChartDate} spaced={false} />
              </section>
            );
          }

          if (sectionId === 'myPhotos' && homeSections.myPhotos && myCaptainPhotos.length > 0) {
            return (
              <section key={sectionId} style={{ marginBottom: 30 }}>
                <SectionHeader
                  title="내 조황 사진"
                  viewAllHref="/my-photos"
                />
                <div className="row g-3">
                  {myCaptainPhotos.slice(0, 4).map((photo) => (
                    <div key={photo.id} className="col-6">
                      <GridCard
                        title={photo.tripDate}
                        subtitle={photo.species || '조황 사진'}
                        imageUrl={photo.imageUrls[0]}
                        href="/my-photos"
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          }

          if (sectionId === 'community' && homeSections.community) {
            return (
              <Fragment key={sectionId}>
                <section style={{ marginBottom: 30 }}>
                  <SectionHeader
                    title="조황 사진"
                    viewAllHref="/community/photos"
                  />
                  <div className="row g-3">
                    {isPhotoDummy
                      ? DUMMY_PHOTOS.map((p) => (
                          <div key={p.photoId} className="col-6">
                            <CommunityPhotoCard title={p.title} date={p.subtitle} />
                          </div>
                        ))
                      : photos.map((photo) => (
                          <div key={photo.photoId} className="col-6">
                            <CommunityPhotoCard
                              title={photo.title?.trim() || '조황 사진'}
                              imageUrl={photo.imageUrls?.[0] || photo.imageUrl}
                              author={displayMemberName(photo.uploadedByName, canSeeFullNames)}
                              date={formatPhotoCardDate(photo.uploadedAt)}
                              commentCount={photo.commentCount}
                              isDeleted={photo.isDeleted}
                              href={`/community/${photo.photoId}`}
                            />
                          </div>
                        ))}
                  </div>
                </section>

                <section style={{ marginBottom: 30 }}>
                  <SectionHeader
                    title="낚시 팁 · FAQ"
                    viewAllHref="/community/faq"
                  />
                  {faqPosts.length === 0 ? (
                    <EmptyState
                      icon={IoBookOutline}
                      message="등록된 팁이 없습니다"
                      compact
                      style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    />
                  ) : (
                    <div style={{ ...OHGO_CARD, overflow: 'hidden' }}>
                      {faqPosts.map((post, index) => (
                        <div key={post.photoId}>
                          {index > 0 ? <div style={{ ...OHGO_LIST_DIVIDER, marginInline: 12 }} /> : null}
                          <QnaListItem
                            compact
                            badge="TIP"
                            commentLabel="댓글"
                            categoryLabel={categoryLabel('faq', post.category, faqCategories)}
                            title={
                              post.isDeleted
                                ? COMMUNITY_POST_DELETED_MESSAGE
                                : post.title?.trim() || '제목 없음'
                            }
                            author={displayMemberName(post.uploadedByName, canSeeFullNames)}
                            date={formatPhotoCardDate(post.uploadedAt)}
                            commentCount={post.commentCount}
                            isDeleted={post.isDeleted}
                            notice={Boolean(post.isNotice)}
                            href={`/community/${post.photoId}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={{ marginBottom: 30 }}>
                  <SectionHeader
                    title="낚시 Q&A"
                    viewAllHref="/community/qna"
                  />
                  {qnaPosts.length === 0 ? (
                    <EmptyState
                      icon={IoHelpCircleOutline}
                      message="등록된 질문이 없습니다"
                      compact
                      style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                    />
                  ) : (
                    <div style={{ ...OHGO_CARD, overflow: 'hidden' }}>
                      {qnaPosts.map((post, index) => (
                        <div key={post.photoId}>
                          {index > 0 ? <div style={{ ...OHGO_LIST_DIVIDER, marginInline: 12 }} /> : null}
                          <QnaListItem
                            compact
                            badge="Q"
                            commentLabel="답변"
                            accepted={Boolean(post.acceptedCommentId)}
                            categoryLabel={categoryLabel('qna', post.category, qnaCategories)}
                            title={
                              post.isDeleted
                                ? COMMUNITY_POST_DELETED_MESSAGE
                                : post.title?.trim() || '제목 없음'
                            }
                            author={displayMemberName(post.uploadedByName, canSeeFullNames)}
                            date={formatPhotoCardDate(post.uploadedAt)}
                            commentCount={post.commentCount}
                            isDeleted={post.isDeleted}
                            notice={Boolean(post.isNotice)}
                            href={`/community/${post.photoId}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </Fragment>
            );
          }

          if (sectionId === 'miniGames' && homeSections.miniGames) {
            return (
              <section key={sectionId} style={{ marginBottom: 30 }}>
                <SectionHeader title="미니게임" viewAllHref="/mini-games" />
                {games.length === 0 ? (
                  <EmptyState
                    icon={IoGameControllerOutline}
                    message="준비 중인 게임이 없습니다"
                    compact
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  />
                ) : (
                  <HorizontalScroll
                    className="d-flex gap-3 overflow-auto pb-1"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {games.map((game, i) => (
                      <FeaturedCard
                        key={game.game_id}
                        title={game.game_name}
                        imageUrl={gameImage(game)}
                        badge={i === 0 ? '인기' : undefined}
                        href="/mini-games"
                      />
                    ))}
                  </HorizontalScroll>
                )}
              </section>
            );
          }

          if (sectionId === 'market' && homeSections.market) {
            return (
              <section key={sectionId} style={{ marginBottom: 30 }}>
                <SectionHeader
                  title="중고장터"
                  viewAllHref="/market"
                />
                {marketListings.length === 0 ? (
                  <EmptyState
                    icon={IoStorefrontOutline}
                    message="등록된 판매글이 없습니다"
                    compact
                    style={{ backgroundColor: '#FFFFFF', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  />
                ) : (
                  <div className="ohgo-market-grid">
                    {marketListings.map((listing) => (
                      <MarketListingCard
                        key={listing.id}
                        listing={listing}
                        href={`/market/${listing.id}`}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
