'use client';

import { useState, useEffect, Suspense, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import SubPageFrame from '@/components/SubPageFrame';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';
import { IoChevronForwardOutline } from 'react-icons/io5';
import {
  getRosterConfig,
  isTripConfirmed,
  updateAttendanceLocationTime,
  type RosterItem,
} from '@/utils/roster-service';
import { blobToDataUrl, storeRosterPreviewImage } from '@/lib/roster-preview-image';
import { drawRosterImage } from '@/lib/draw-roster-image';

const SECTION_TITLE: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#1A1D1F',
  fontFamily: OHGO_FONT,
  marginBottom: 12,
};

const pillStyle = (active: boolean): CSSProperties => ({
  border: 'none',
  borderRadius: 20,
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: OHGO_FONT,
  backgroundColor: active ? '#EBF1FE' : '#F2F3F5',
  color: active ? '#1B6FF5' : '#6F767E',
  cursor: 'pointer',
});

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 14;
const FONT_SIZE_DEFAULT = 10;

function parseSavedFontSize(raw: string | null): number {
  if (!raw) return FONT_SIZE_DEFAULT;
  const named: Record<string, number> = { small: 8, medium: 10, large: 12, xlarge: 14 };
  if (raw in named) return named[raw];
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n));
}

function LocationTimeSelectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const dateDisplay = searchParams.get('dateDisplay');
  const dateYear = searchParams.get('dateYear');
  const dateMonth = searchParams.get('dateMonth');
  const dateDay = searchParams.get('dateDay');
  const tripNumber = searchParams.get('tripNumber');
  const rosterItemsJson = searchParams.get('rosterItems');

  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>('12');
  const [savingImage, setSavingImage] = useState(false);
  const [rosterItems, setRosterItems] = useState<RosterItem[]>([]);
  const [shipName, setShipName] = useState<string>('');
  const [shipTon, setShipTon] = useState<string>('');
  const [desc01, setDesc01] = useState<string>('');
  const [desc02, setDesc02] = useState<string>('');
  const [onBoard, setOnBoard] = useState<boolean>(false);
  const [selectedFontSize, setSelectedFontSize] = useState(FONT_SIZE_DEFAULT);
  
  const tripNum = tripNumber ? parseInt(tripNumber) : 1;

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

  // Check if selected time is earlier than current time (for next day indicator)
  const isNextDay = () => {
    const currentHour = new Date().getHours();
    const selectedHour = parseInt(selectedTime);
    return selectedHour < currentHour;
  };

  useEffect(() => {
    setSelectedFontSize(parseSavedFontSize(localStorage.getItem('roster_font_size_preference')));
  }, []);

  const saveFontSizePreference = (fontSize: number) => {
    const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, fontSize));
    try {
      localStorage.setItem('roster_font_size_preference', String(next));
      setSelectedFontSize(next);
    } catch (error) {
      console.error('Error saving font size preference:', error);
    }
  };

  // Check trip status
  const checkTripStatus = async () => {
    if (!date || !tripNumber) return false;
    try {
      const tripNumLocal = parseInt(tripNumber) || 1;
      if (await isTripConfirmed(String(date), tripNumLocal)) {
        alert(`${dateDisplay} ${tripNumLocal}항차는 이미 출항 확정되었습니다.`);
        router.back();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking trip status:', error);
      return false;
    }
  };

  useEffect(() => {
    const init = async () => {
      const tripAlreadyMade = await checkTripStatus();
      if (!tripAlreadyMade) {
        await loadLocations();
        if (rosterItemsJson) {
          try {
            const parsedRosterItems = JSON.parse(decodeURIComponent(rosterItemsJson)) as RosterItem[];
            setRosterItems(parsedRosterItems);
          } catch (error) {
            console.error('Error parsing roster items:', error);
          }
        }
      }
    };
    init();
  }, []);

  const loadLocations = async () => {
    setLoading(true);
    try {
      const config = await getRosterConfig();
      setLocations(config.areas);
      setSelectedLocations([config.areas[0]]);
      setShipName(config.shipName);
      setShipTon(config.ton);
      setDesc01(config.desc01);
      setDesc02(config.desc02);
      setOnBoard(config.onBoard);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
      const fallbackLocations = ['내만'];
      setLocations(fallbackLocations);
      setSelectedLocations([fallbackLocations[0]]);
    } finally {
      setLoading(false);
    }
  };

  const updateAttendanceWithLocationAndTime = async () => {
    try {
      if (!date) {
        console.error('No date provided for attendance update');
        return false;
      }
      await updateAttendanceLocationTime(
        String(date),
        selectedLocations,
        selectedTime,
        parseInt(tripNumber || '1')
      );
      return true;
    } catch (error) {
      console.error('Error updating attendance:', error);
      return false;
    }
  };

  const captureAndSaveImage = async () => {
    if (!selectedLocations.length) {
      alert('위치를 선택해주세요.');
      return;
    }

    try {
      const success = await updateAttendanceWithLocationAndTime();
      if (!success) return;

      setSavingImage(true);
      const blob = await drawRosterImage({
        items: rosterItems,
        shipName,
        shipTon,
        desc01,
        desc02,
        onBoard,
        dateYear: dateYear || '',
        dateMonth: dateMonth || '',
        dateDay: dateDay || '',
        locations: selectedLocations,
        arrivalLabel: `${isNextDay() ? `(익일) ${selectedTime}` : selectedTime} 시`,
        cellFontSize: selectedFontSize,
      });
      storeRosterPreviewImage(await blobToDataUrl(blob));
      router.push(
        `/roster-preview?local=1&date=${date}&tripNumber=${tripNumber}&fontSize=${selectedFontSize}`
      );
    } catch (error) {
      console.error('Error capturing image:', error);
      alert('이미지 생성 중 오류가 발생했습니다.');
      setSavingImage(false);
    }
  };

  const stepperBtn = (disabled: boolean): CSSProperties => ({
    width: 44,
    height: 44,
    border: 'none',
    borderRadius: 12,
    backgroundColor: disabled ? '#F2F3F5' : '#EBF1FE',
    color: disabled ? '#C4C4C4' : '#1B6FF5',
    fontSize: 22,
    fontWeight: 700,
    fontFamily: OHGO_FONT,
    lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <SubPageFrame title="위치 및 시간 선택">
      <div className="p-3 mb-3 text-center" style={OHGO_CARD}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: '#1B6FF5',
            fontFamily: OHGO_FONT,
            letterSpacing: -0.3,
            lineHeight: 1.35,
          }}
        >
          {dateDisplay || date || '날짜 미선택'} {tripNum}항차
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            fontWeight: 600,
            color: '#6F767E',
            fontFamily: OHGO_FONT,
          }}
        >
          위치 및 입항시간 선택
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p style={{ fontSize: 14, color: '#6F767E', fontFamily: OHGO_FONT }}>
            정보를 불러오는 중...
          </p>
        </div>
      ) : (
        <>
          <div className="p-3 mb-3" style={OHGO_CARD}>
            <div style={SECTION_TITLE}>
              위치 선택 <span style={{ color: '#FF3B30' }}>*</span>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {locations.map((location) => {
                const active = selectedLocations.includes(location);
                return (
                  <button
                    key={location}
                    type="button"
                    style={pillStyle(active)}
                    onClick={() => {
                      const next = active
                        ? selectedLocations.filter((loc) => loc !== location)
                        : [...selectedLocations, location];
                      if (next.length > 0) setSelectedLocations(next);
                    }}
                  >
                    {location}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 mb-3" style={OHGO_CARD}>
            <div style={SECTION_TITLE}>
              입항시간 선택 <span style={{ color: '#FF3B30' }}>*</span>
            </div>
            <select
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              style={{ ...OHGO_INPUT, width: '100%', backgroundColor: '#FFFFFF' }}
            >
              {hours.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}시{isNextDay() && parseInt(hour, 10) === parseInt(selectedTime, 10) ? ' (익일)' : ''}
                </option>
              ))}
            </select>
            {isNextDay() && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#E65100',
                  fontFamily: OHGO_FONT,
                }}
              >
                선택 시간이 현재보다 이르면 익일로 표시됩니다.
              </div>
            )}
          </div>

          <div className="p-3 mb-3" style={OHGO_CARD}>
            <div style={SECTION_TITLE}>글자크기</div>
            <div className="d-flex align-items-center justify-content-center gap-3">
              <button
                type="button"
                aria-label="글자 작게"
                style={stepperBtn(selectedFontSize <= FONT_SIZE_MIN)}
                disabled={selectedFontSize <= FONT_SIZE_MIN}
                onClick={() => saveFontSizePreference(selectedFontSize - 1)}
              >
                −
              </button>
              <div
                style={{
                  minWidth: 56,
                  textAlign: 'center',
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#1A1D1F',
                  fontFamily: OHGO_FONT,
                  letterSpacing: -0.3,
                }}
              >
                {selectedFontSize}
              </div>
              <button
                type="button"
                aria-label="글자 크게"
                style={stepperBtn(selectedFontSize >= FONT_SIZE_MAX)}
                disabled={selectedFontSize >= FONT_SIZE_MAX}
                onClick={() => saveFontSizePreference(selectedFontSize + 1)}
              >
                +
              </button>
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className={`btn w-100 d-flex align-items-center justify-content-center gap-2 ${OHGO_CONFIRM_BTN_CLASS}`}
        style={{
          ...OHGO_CONFIRM_BTN,
          opacity: savingImage || !selectedLocations.length ? 0.65 : 1,
        }}
        onClick={captureAndSaveImage}
        disabled={savingImage || !selectedLocations.length}
      >
        {savingImage ? (
          <>
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">생성 중...</span>
            </div>
            <span>생성 중...</span>
          </>
        ) : (
          <>
            <span>다음</span>
            <IoChevronForwardOutline size={20} className="flex-shrink-0" aria-hidden />
          </>
        )}
      </button>
    </SubPageFrame>
  );
}

export default function LocationTimeSelectionPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <LocationTimeSelectionContent />
    </Suspense>
  );
}

