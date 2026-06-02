'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import { OhgoModalInfoList, OhgoModalInfoRow } from '@/components/OhgoModal';
import {
  createReservation,
  getBoardingInfo,
  getReservationCount,
  getReservationSettings,
  hasUserReserved,
  type BoardingInfoSummary,
  type TripReservationStatus,
} from '@/utils/reservation-service';
import {
  getTripById,
  isPastTripSchedule,
  isTripDateViewable,
  tripDateToStr,
  type TripGuide,
} from '@/utils/trip-guide-service';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_DISMISS_BTN,
  OHGO_DISMISS_BTN_CLASS,
  OHGO_FONT,
  OhgoPageLoading,
} from '@/lib/page-styles';
import {
  IoBoatOutline,
  IoCalendarOutline,
  IoCallOutline,
  IoCheckmark,
  IoFishOutline,
  IoPersonOutline,
  IoTimeOutline,
} from 'react-icons/io5';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatPrice(p?: number) {
  if (!p) return '';
  return p.toLocaleString('ko-KR') + '원';
}

function formatTripDate(dateStr: string) {
  const m = parseInt(dateStr.split('-')[1], 10);
  const d = parseInt(dateStr.split('-')[2], 10);
  const weekday = DAY_LABELS[new Date(`${dateStr}T12:00:00`).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

function formatBirthDisplay(birth: string) {
  const digits = birth.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  return birth;
}

function ReservationStepper({ step }: { step: 1 | 2 }) {
  const active = '#237FFF';
  const inactive = '#E5E5E5';
  const inactiveText = '#9A9FA5';

  return (
    <div className="d-flex align-items-center gap-2 mb-4" style={{ padding: '0 4px' }}>
      <div className="d-flex flex-column align-items-center" style={{ gap: 6, minWidth: 72 }}>
        <div
          className="trip-reservation-stepper__circle"
          style={{
            backgroundColor: active,
            color: '#FFFFFF',
          }}
        >
          {step > 1 ? <IoCheckmark size={16} /> : '1'}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: active, fontFamily: FONT }}>예약 정보</span>
      </div>
      <div
        className="trip-reservation-stepper__line"
        style={{ backgroundColor: step >= 2 ? active : inactive }}
      />
      <div className="d-flex flex-column align-items-center" style={{ gap: 6, minWidth: 72 }}>
        <div
          className="trip-reservation-stepper__circle"
          style={{
            backgroundColor: step >= 2 ? active : inactive,
            color: step >= 2 ? '#FFFFFF' : inactiveText,
          }}
        >
          {step >= 2 ? <IoCheckmark size={16} /> : '2'}
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: step >= 2 ? active : inactiveText,
            fontFamily: FONT,
          }}
        >
          예약 완료
        </span>
      </div>
    </div>
  );
}

function TripReservationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get('tripId') ?? '';
  const todayStr = tripDateToStr();

  const [ready, setReady] = useState(false);
  const [trip, setTrip] = useState<TripGuide | null>(null);
  const [boardingInfo, setBoardingInfo] = useState<BoardingInfoSummary | null>(null);
  const [reserveCount, setReserveCount] = useState(0);
  const [step, setStep] = useState<1 | 2>(1);
  const [reservationStatus, setReservationStatus] = useState<TripReservationStatus | null>(null);
  const [reserving, setReserving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isTripFull =
    trip?.capacity != null && trip.capacity > 0 && reserveCount >= trip.capacity;

  const load = useCallback(async () => {
    if (!tripId) {
      setLoadError('출조 정보가 없습니다.');
      setReady(true);
      return;
    }

    const user = await getUser();
    if (!user?.uuid) {
      router.replace('/login');
      return;
    }

    const settings = await getReservationSettings();
    if (!settings.enabled) {
      alert('예약 기능이 비활성화되어 있습니다.');
      router.replace('/community/trip-guide');
      return;
    }

    const tripData = await getTripById(tripId);
    if (!tripData) {
      setLoadError('출조 일정을 찾을 수 없습니다.');
      setReady(true);
      return;
    }

    if (!isTripDateViewable(tripData.date, todayStr) || isPastTripSchedule(tripData.date, tripData.departureTime)) {
      alert('출항 시간이 지나 예약할 수 없는 일정입니다.');
      router.replace('/community/trip-guide');
      return;
    }

    const [boarding, count, alreadyReserved] = await Promise.all([
      getBoardingInfo(user.uuid),
      getReservationCount(tripId),
      hasUserReserved(tripId, user.uuid),
    ]);

    if (!boarding) {
      if (confirm('승선정보가 등록되어 있어야 예약할 수 있습니다. 승선정보 작성 페이지로 이동할까요?')) {
        router.replace('/boarding-form');
      } else {
        router.back();
      }
      return;
    }

    if (alreadyReserved) {
      alert('이미 예약한 일정입니다.');
      router.replace('/my-reservations');
      return;
    }

    if (tripData.capacity != null && tripData.capacity > 0 && count >= tripData.capacity) {
      alert('정원이 마감되었습니다.');
      router.replace('/community/trip-guide');
      return;
    }

    setTrip(tripData);
    setBoardingInfo(boarding);
    setReserveCount(count);
    setReady(true);
  }, [tripId, router, todayStr]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReserve = async () => {
    if (!trip) return;
    const user = await getUser();
    if (!user?.uuid) {
      router.replace('/login');
      return;
    }
    setReserving(true);
    try {
      const result = await createReservation(trip.id, { uuid: user.uuid, name: user.name });
      if (!result.ok) {
        if (result.code === 'NO_BOARDING') {
          alert('승선정보를 먼저 등록해 주세요.');
          router.push('/boarding-form');
          return;
        }
        if (result.code === 'DUPLICATE') {
          alert('이미 예약한 일정입니다.');
          router.replace('/my-reservations');
          return;
        }
        if (result.code === 'FULL') {
          alert('정원이 마감되었습니다.');
          router.replace('/community/trip-guide');
          return;
        }
        if (result.code === 'DISABLED') {
          alert('예약 기능이 비활성화되어 있습니다.');
          router.replace('/community/trip-guide');
          return;
        }
        if (result.code === 'PAST_TRIP') {
          alert('출항 시간이 지나 예약할 수 없습니다.');
          router.replace('/community/trip-guide');
          return;
        }
        alert('예약 처리 중 오류가 발생했습니다.');
        return;
      }
      setReservationStatus(result.status);
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setReserving(false);
    }
  };

  if (!ready) {
    return <OhgoPageLoading />;
  }

  if (loadError || !trip) {
    return (
      <SubPageFrame title="출조 예약" onBack={() => router.replace('/community/trip-guide')}>
        <div className="p-4 text-center" style={{ fontFamily: FONT, color: '#6F767E' }}>
          {loadError ?? '출조 정보를 불러올 수 없습니다.'}
        </div>
      </SubPageFrame>
    );
  }

  if (step === 2) {
    const successMessage =
      reservationStatus === 'confirmed'
        ? '예약이 확정되었습니다.'
        : '예약이 접수되었습니다.\n승인 후 확정됩니다.';

    return (
      <SubPageFrame title="출조 예약" onBack={() => router.replace('/community/trip-guide')}>
        <ReservationStepper step={2} />
        <div
          className="d-flex flex-column align-items-center text-center py-4"
          style={{ ...CARD, padding: '32px 24px' }}
        >
          <div
            className="trip-reservation-success__icon d-flex align-items-center justify-content-center mb-4"
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: '#237FFF',
            }}
          >
            <IoCheckmark size={44} color="#FFFFFF" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1A1D1F', fontFamily: FONT, marginBottom: 12 }}>
            예약 완료!
          </h2>
          <p
            className="mb-0"
            style={{
              fontSize: 15,
              color: '#6F767E',
              fontFamily: FONT,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {successMessage}
          </p>
          <p className="mt-3 mb-0" style={{ fontSize: 14, color: '#1A1D1F', fontFamily: FONT, fontWeight: 600 }}>
            {trip.destination}
          </p>
          <p className="mb-0" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT }}>
            {formatTripDate(trip.date)} · {trip.departureTime} 출발
          </p>
        </div>
        <div className="trip-reservation-actions trip-reservation-actions--row">
          <button
            type="button"
            className={`btn flex-fill fw-bold ${OHGO_DISMISS_BTN_CLASS}`}
            style={OHGO_DISMISS_BTN}
            onClick={() => router.replace('/community/trip-guide')}
          >
            출조 안내로
          </button>
          <button
            type="button"
            className={`btn flex-fill fw-bold ${OHGO_CONFIRM_BTN_CLASS}`}
            style={OHGO_CONFIRM_BTN}
            onClick={() => router.replace('/my-reservations')}
          >
            나의 예약
          </button>
        </div>
      </SubPageFrame>
    );
  }

  return (
    <SubPageFrame title="출조 예약" onBack={() => router.back()}>
      <ReservationStepper step={1} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...CARD, padding: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 12 }}>
            {trip.destination}
          </div>
          <OhgoModalInfoList>
            <OhgoModalInfoRow icon={IoBoatOutline} variant="date" value={formatTripDate(trip.date)} />
            <OhgoModalInfoRow
              icon={IoTimeOutline}
              label="출항 시간(귀항 예정)"
              value={`${trip.departureTime}${trip.returnTime ? ` ~ ${trip.returnTime}` : ''}`}
            />
            {trip.species ? (
              <OhgoModalInfoRow icon={IoFishOutline} label="목표 어종" value={trip.species} />
            ) : null}
          </OhgoModalInfoList>
        </div>

        {boardingInfo ? (
          <div style={{ ...CARD, padding: 16 }}>
            <div
              className="d-flex align-items-center justify-content-between"
              style={{ marginBottom: 12 }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT }}>
                승선자 정보
              </div>
              <button
                type="button"
                className="trip-reservation-boarding-card__edit"
                onClick={() => router.push('/boarding-form')}
              >
                수정
              </button>
            </div>
            <OhgoModalInfoList>
              <OhgoModalInfoRow
                icon={IoPersonOutline}
                label="이름"
                value={
                  <>
                    {boardingInfo.name}
                    {boardingInfo.gender ? ` · ${boardingInfo.gender}` : ''}
                  </>
                }
              />
              {boardingInfo.birth ? (
                <OhgoModalInfoRow
                  icon={IoCalendarOutline}
                  label="생년월일"
                  value={formatBirthDisplay(boardingInfo.birth)}
                />
              ) : null}
              <OhgoModalInfoRow icon={IoCallOutline} label="연락처" value={boardingInfo.phone} />
            </OhgoModalInfoList>
          </div>
        ) : null}

        {trip.capacity != null && trip.capacity > 0 ? (
          <div
            className="px-3 py-2 rounded-3"
            style={{ ...CARD, fontSize: 13, color: '#6F767E', fontFamily: FONT, fontWeight: 600 }}
          >
            예약 {reserveCount}명 / 정원 {trip.capacity}명
          </div>
        ) : null}

        <p className="mb-0 px-1" style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, lineHeight: 1.5 }}>
          결제 없이 예약만 진행됩니다.
        </p>

        {trip.price ? (
          <div
            className="p-3 rounded-3 d-flex align-items-center justify-content-between"
            style={{ ...CARD, backgroundColor: '#EBF1FE' }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1B6FF5', fontFamily: FONT }}>1인 요금</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#1B6FF5', fontFamily: FONT }}>
              {formatPrice(trip.price)}
            </span>
          </div>
        ) : null}

        <div className="trip-reservation-actions">
          <button
            type="button"
            className={`btn w-100 fw-bold ${OHGO_CONFIRM_BTN_CLASS}`}
            style={OHGO_CONFIRM_BTN}
            disabled={reserving || isTripFull}
            onClick={() => void handleReserve()}
          >
            {reserving ? '처리 중...' : isTripFull ? '정원 마감' : '예약하기'}
          </button>
        </div>
      </div>
    </SubPageFrame>
  );
}

export default function TripReservationPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <TripReservationContent />
    </Suspense>
  );
}
