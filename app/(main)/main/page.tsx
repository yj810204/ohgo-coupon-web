'use client';

import { useEffect, useCallback, useState, Fragment } from 'react';
import { getUser } from '@/lib/storage';
import { resolveAppUser } from '@/lib/auth-session';
import { isDevAuthBypass } from '@/lib/dev-auth';
import { getStamps, getCouponCount } from '@/utils/stamp-service';
import { getPhotos, COMMUNITY_POST_DELETED_MESSAGE, type CommunityPhoto } from '@/utils/community-service';
import { getPhotosForUser, type CaptainPhoto } from '@/utils/captain-photo-service';
import { getActiveGames, type Game } from '@/lib/game-service';
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
import MarketListingCard from '@/components/market/MarketListingCard';
import {
  getTripsInDateRange,
  getWeekRange,
  tripDateToStr,
  type TripGuide,
} from '@/utils/trip-guide-service';
import { getApprovedListings, type MarketListing } from '@/utils/market-service';
import { getAvatarPublicUrl } from '@/utils/member-profile-service';
import { displayMemberName, formatPhotoCardDate } from '@/lib/mask-member-name';
import {
  DEFAULT_HOME_SECTIONS,
  DEFAULT_HOME_SECTION_ORDER,
  getSiteSettings,
  normalizeHomeSectionOrder,
  type HomeSectionId,
  type HomeSectionVisibility,
} from '@/utils/site-settings-service';
import {
  categoryLabel,
  getBoardCategories,
  type BoardCategory,
} from '@/utils/board-category-service';
import { IoBookOutline, IoGameControllerOutline, IoHelpCircleOutline, IoStorefrontOutline } from 'react-icons/io5';
import EmptyState from '@/components/EmptyState';
import { OHGO_CARD, OHGO_LIST_DIVIDER, OhgoPageLoading } from '@/lib/page-styles';
import { confirmBoardingForStampScan } from '@/lib/stamps/confirm-boarding-for-scan';

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export default function MainPage() {
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
  const [stampCount, setStampCount] = useState(0);
  const [couponCount, setCouponCount] = useState(0);
  const [photos, setPhotos] = useState<CommunityPhoto[]>([]);
  const [faqPosts, setFaqPosts] = useState<CommunityPhoto[]>([]);
  const [qnaPosts, setQnaPosts] = useState<CommunityPhoto[]>([]);
  const [faqCategories, setFaqCategories] = useState<BoardCategory[]>([]);
  const [qnaCategories, setQnaCategories] = useState<BoardCategory[]>([]);
  const [myCaptainPhotos, setMyCaptainPhotos] = useState<CaptainPhoto[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [marketListings, setMarketListings] = useState<MarketListing[]>([]);
  const [weekTrips, setWeekTrips] = useState<TripGuide[]>([]);
  const [weekTripsLoading, setWeekTripsLoading] = useState(true);
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
      const settings = await getSiteSettings();
      visibility = visibility ?? settings.homeSections;
      sectionOrder = sectionOrder ?? settings.homeSectionOrder;
    }
    applyHomeLayout({ homeSections: visibility, homeSectionOrder: sectionOrder });

    const weekRange = getWeekRange(new Date());
    const [stamps, coupons, photoList, faqList, qnaList, faqCats, qnaCats, activeGames, marketItems, taggedPhotos, avatar, trips] =
      await Promise.allSettled([
        visibility.stampCoupon ? getStamps(uuid) : Promise.resolve([]),
        visibility.stampCoupon ? getCouponCount(uuid) : Promise.resolve(0),
        visibility.community ? getPhotos(4) : Promise.resolve([]),
        visibility.community ? getPhotos(3, 'faq') : Promise.resolve([]),
        visibility.community ? getPhotos(3, 'qna') : Promise.resolve([]),
        visibility.community ? getBoardCategories('faq', { includeInactive: true }) : Promise.resolve([]),
        visibility.community ? getBoardCategories('qna', { includeInactive: true }) : Promise.resolve([]),
        visibility.miniGames ? getActiveGames() : Promise.resolve([]),
        visibility.market ? getApprovedListings() : Promise.resolve([]),
        visibility.myPhotos ? getPhotosForUser(uuid) : Promise.resolve([]),
        getAvatarPublicUrl(uuid),
        visibility.weeklyTrip
          ? getTripsInDateRange(tripDateToStr(weekRange.start), tripDateToStr(weekRange.end))
          : Promise.resolve([]),
      ]);

    setStampCount(settledValue(stamps, []).length);
    setCouponCount(settledValue(coupons, 0));
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
      const settingsPromise = getSiteSettings();
      const cached = await getUser();
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
        void loadRemoteData(cached.uuid, settings.homeSections, settings.homeSectionOrder);
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

      if (!cached?.uuid || cached.uuid !== appUser.uuid) {
        void loadRemoteData(appUser.uuid, settings.homeSections, settings.homeSectionOrder);
      }
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
    const appUser = await resolveAppUser();
    setUser({
      ...localUser,
      isAdmin: appUser?.isAdmin,
      isCaptain: appUser?.isCaptain,
    });
    await loadRemoteData(localUser.uuid);
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
            onMyPage={() => navigate('/my-page')}
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
                  stampCount={stampCount}
                  couponCount={couponCount}
                  onStampClick={() => navigate(`/stamp?${query}`)}
                  onCouponClick={() => navigate(`/coupons?${query}`)}
                  onQrScan={async () => {
                    if (!user?.uuid) return false;
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
                onViewAll={() => navigate('/community/trip-guide')}
                trips={weekTrips}
                isLoading={weekTripsLoading}
              />
            );
          }

          if (sectionId === 'tide' && homeSections.tide) {
            return (
              <TripTidePanel
                key={sectionId}
                date={tripDateToStr()}
                onViewAll={() => navigate('/tide')}
              />
            );
          }

          if (sectionId === 'myPhotos' && homeSections.myPhotos && myCaptainPhotos.length > 0) {
            return (
              <section key={sectionId} style={{ marginBottom: 30 }}>
                <SectionHeader
                  title="내 조황 사진"
                  onViewAll={() => navigate('/my-photos')}
                />
                <div className="row g-3">
                  {myCaptainPhotos.slice(0, 4).map((photo) => (
                    <div key={photo.id} className="col-6">
                      <GridCard
                        title={photo.tripDate}
                        subtitle={photo.species || '조황 사진'}
                        imageUrl={photo.imageUrls[0]}
                        onClick={() => navigate('/my-photos')}
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
                    onViewAll={() => navigate('/community/photos')}
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
                              onClick={() => navigate(`/community/${photo.photoId}`)}
                            />
                          </div>
                        ))}
                  </div>
                </section>

                <section style={{ marginBottom: 30 }}>
                  <SectionHeader
                    title="낚시 팁 · FAQ"
                    onViewAll={() => navigate('/community/faq')}
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
                            onClick={() => navigate(`/community/${post.photoId}`)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section style={{ marginBottom: 30 }}>
                  <SectionHeader
                    title="낚시 Q&A"
                    onViewAll={() => navigate('/community/qna')}
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
                            onClick={() => navigate(`/community/${post.photoId}`)}
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
                <SectionHeader title="미니게임" onViewAll={() => navigate('/mini-games')} />
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
                        onClick={() => navigate('/mini-games')}
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
                  onViewAll={() => navigate('/market')}
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
                        onClick={() => navigate(`/market/${listing.id}`)}
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
