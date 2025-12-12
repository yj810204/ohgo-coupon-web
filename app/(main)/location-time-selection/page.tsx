'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import html2canvas from 'html2canvas';

type RosterItem = {
  id: string;
  name: string;
  birth: string;
  gender: string;
  phone: string;
  emergency: string;
  address: string;
  hasRoster: boolean;
  isCaptain?: boolean;
  isSailor?: boolean;
  role?: string;
};

// A4 용지 비율에 맞는 크기 설정
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

// Font size mapping
const getFontSize = (size: string) => {
  switch(size) {
    case 'small': return 8;
    case 'medium': return 10;
    case 'large': return 12;
    case 'xlarge': return 14;
    default: return 10;
  }
};

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
  const [selectedFontSize, setSelectedFontSize] = useState<string>('medium');
  
  const a4Ref = useRef<HTMLDivElement>(null);
  const tripNum = tripNumber ? parseInt(tripNumber) : 1;

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));

  // Check if selected time is earlier than current time (for next day indicator)
  const isNextDay = () => {
    const currentHour = new Date().getHours();
    const selectedHour = parseInt(selectedTime);
    return selectedHour < currentHour;
  };

  // Load font size preference from localStorage
  useEffect(() => {
    const savedFontSize = localStorage.getItem('roster_font_size_preference');
    if (savedFontSize) {
      setSelectedFontSize(savedFontSize);
    }
  }, []);

  // Save font size preference to localStorage
  const saveFontSizePreference = (fontSize: string) => {
    try {
      localStorage.setItem('roster_font_size_preference', fontSize);
      setSelectedFontSize(fontSize);
    } catch (error) {
      console.error('Error saving font size preference:', error);
    }
  };

  // Check trip status
  const checkTripStatus = async () => {
    if (!date || !tripNumber) return false;
    try {
      const tripsDocRef = doc(db, 'trips', String(date));
      const tripsDocSnap = await getDoc(tripsDocRef);
      const tripNum = parseInt(tripNumber) || 1;
      if (tripsDocSnap.exists()) {
        const tripKey = `trip${tripNum}`;
        const tripData = tripsDocSnap.data()[tripKey];
        if (tripData && tripData.confirmed) {
          alert(`${dateDisplay} ${tripNum}항차는 이미 출항 확정되었습니다.`);
          router.back();
          return true;
        }
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
      const configDocRef = doc(db, 'config', 'roster');
      const configDocSnap = await getDoc(configDocRef);
      if (configDocSnap.exists()) {
        const data = configDocSnap.data();
        const fallbackLocations = ['내만'];
        const areas = data.areas && data.areas.length > 0 ? data.areas : fallbackLocations;
        setLocations(areas);
        setSelectedLocations([areas[0]]);
        setShipName(data.ship_name || '');
        setShipTon(data.ton || '');
        setDesc01(data.desc01 || '');
        setDesc02(data.desc02 || '');
        setOnBoard(data.on_board !== undefined ? data.on_board : false);
      } else {
        const fallbackLocations = ['내만'];
        setLocations(fallbackLocations);
        setSelectedLocations([fallbackLocations[0]]);
      }
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

  // Update attendance with location and time
  const updateAttendanceWithLocationAndTime = async () => {
    try {
      if (!date) {
        console.error('No date provided for attendance update');
        return false;
      }
      const attendanceRef = doc(db, 'attendance', String(date));
      const attendanceSnap = await getDoc(attendanceRef);
      const tripNum = parseInt(tripNumber || '1');

      if (attendanceSnap.exists()) {
        await updateDoc(attendanceRef, {
          location: selectedLocations,
          arrivalTime: selectedTime,
          tripNumber: tripNum,
        });
      } else {
        await setDoc(attendanceRef, {
          location: selectedLocations,
          arrivalTime: selectedTime,
          tripNumber: tripNum,
          members: [],
        });
      }
      return true;
    } catch (error) {
      console.error('Error updating attendance:', error);
      return false;
    }
  };

  // Capture and save image
  const captureAndSaveImage = async () => {
    if (!selectedLocations.length) {
      alert('위치를 선택해주세요.');
      return;
    }

    try {
      const success = await updateAttendanceWithLocationAndTime();
      if (!success) return;

      setSavingImage(true);

      if (a4Ref.current) {
        // Wait a bit for rendering
        await new Promise(resolve => setTimeout(resolve, 500));

        const canvas = await html2canvas(a4Ref.current, {
          width: A4_WIDTH,
          height: A4_HEIGHT,
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        canvas.toBlob(async (blob) => {
          if (!blob) {
            alert('이미지 생성에 실패했습니다.');
            setSavingImage(false);
            return;
          }

          const imageUrl = URL.createObjectURL(blob);
          
          router.push(`/roster-preview?imageUri=${encodeURIComponent(imageUrl)}&date=${date}&tripNumber=${tripNumber}&fontSize=${selectedFontSize}`);
        }, 'image/jpeg', 0.9);
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      alert('이미지 생성 중 오류가 발생했습니다.');
      setSavingImage(false);
    }
  };

  const cellFontSize = getFontSize(selectedFontSize);

  // Render A4 roster
  const renderA4Roster = () => (
    <div 
      ref={a4Ref}
      style={{
        width: `${A4_WIDTH}px`,
        height: `${A4_HEIGHT}px`,
        backgroundColor: 'white',
        padding: '40px',
        fontFamily: 'sans-serif',
        position: 'absolute',
        top: '-9999px',
        left: '-9999px'
      }}
    >
      <div style={{ fontSize: '12px', textAlign: 'left', marginBottom: '20px' }}>
        ■ 낚시 관리 및 육성법 시행규칙 [별지 제16호서식]
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '5px' }}>
        <div style={{ fontSize: '34px', fontWeight: 'bold' }}>승 선 자 명 부</div>
        {shipName && <div style={{ fontSize: '28px', fontWeight: 'bold', marginLeft: '15px' }}>({shipName})</div>}
      </div>
      <div style={{ fontSize: '14px', textAlign: 'center' }}>{desc01}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '5px', padding: '5px 0' }}>
        <div style={{ fontSize: '16px' }}>(승선일 : {dateYear} 년 {dateMonth} 월 {dateDay} 일)</div>
        <div style={{ fontSize: '16px' }}>{shipTon}</div>
      </div>
      <table style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000', width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #000', borderTop: '1px solid #000', height: '40px' }}>
            <th style={{ width: '4%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold임' }}>
              <div style={{ position: 'relative', top: '-7px' }}> </div>
            </th>
            <th style={{ width: '10%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>성명</div>
            </th>
            <th style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>생년월일</div>
            </th>
            <th style={{ width: '6%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>성별</div>
            </th>
            <th style={{ width: '32%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>주소</div>
            </th>
            <th style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>전화번호</div>
            </th>
            <th style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>비상연락처</div>
            </th>
            <th style={{ width: '6%', padding: '0 3px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              <div style={{ position: 'relative', top: '-7px' }}>비고</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            const captainsAndCrew = rosterItems.filter(item => item.role === 'captain' || item.role === 'sailor');
            const otherPassengers = rosterItems.filter(item => item.role !== 'captain' && item.role !== 'sailor');
            
            const captainCrewRows = captainsAndCrew.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #000', height: '40px' }}>
                <td style={{ width: '4%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>-</div>
                </td>
                <td style={{ width: '10%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.name}</div>
                </td>
                <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.birth}</div>
                </td>
                <td style={{ width: '6%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.gender}</div>
                </td>
                <td style={{ width: '32%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'left', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.address}</div>
                </td>
                <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.phone}</div>
                </td>
                <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.emergency}</div>
                </td>
                <td style={{ width: '6%', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>
                    {item.role === 'captain' ? '선장' : item.role === 'sailor' ? '선원' : ''}
                  </div>
                </td>
              </tr>
            ));
            
            const passengerRows = otherPassengers.map((item, index) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #000', height: '40px' }}>
                <td style={{ width: '4%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{index + 1}</div>
                </td>
                <td style={{ width: '10%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.name}</div>
                </td>
                <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.birth}</div>
                </td>
                <td style={{ width: '6%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.gender}</div>
                </td>
                <td style={{ width: '32%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'left', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.address}</div>
                </td>
                <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.phone}</div>
                </td>
                <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>{item.emergency}</div>
                </td>
                <td style={{ width: '6%', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                  <div style={{ position: 'relative', top: '-7px' }}>
                    {item.role === 'captain' ? '선장' : item.role === 'sailor' ? '선원' : ''}
                  </div>
                </td>
              </tr>
            ));
            
            return [...captainCrewRows, ...passengerRows];
          })()}
          {Array.from({ length: Math.max(0, 15 - rosterItems.length) }).map((_, index) => (
            <tr key={`empty-${index}`} style={{ borderBottom: '1px solid #000', height: '40px' }}>
              <td style={{ width: '4%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '10%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '6%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '32%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'left', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '14%', borderRight: '1px solid #000', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
              <td style={{ width: '6%', padding: '0 3px', textAlign: 'center', fontSize: `${cellFontSize}px` }}>
                <div style={{ position: 'relative', top: '-7px' }}></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '20px', alignItems: 'center', textAlign: 'center' }}>
        {onBoard && <div style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '20px' }}>선 상</div>}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '5px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', width: '100px', textAlign: 'right' }}>위       치 :</div>
          <div style={{ fontSize: '16px', width: '200px', textAlign: 'left', marginLeft: '5px' }}>{selectedLocations.join(', ')}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '5px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', width: '100px', textAlign: 'right' }}>입항시간 :</div>
          <div style={{ fontSize: '16px', width: '200px', textAlign: 'left', marginLeft: '5px' }}>{isNextDay() ? `(익일) ${selectedTime}` : selectedTime} 시</div>
        </div>
        <div style={{ marginTop: '20px', fontSize: '14px', textAlign: 'center' }}>{desc02}</div>
      </div>
    </div>
  );

  return (
    <div className="min-vh-100 bg-light" style={{ paddingBottom: '80px' }}>
      <PageHeader title="위치 및 시간 선택" />
      {renderA4Roster()}
      
      <div className="container pb-4" style={{ paddingTop: '80px' }}>
        <div className="card shadow-sm mb-3">
          <div className="card-body">
            <h5 className="text-primary mb-0 text-center">위치 및 입항시간 선택</h5>
          </div>
        </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">정보를 불러오는 중...</p>
        </div>
      ) : (
        <>
          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <h6 className="mb-3">위치 선택 <span className="text-danger">*</span></h6>
              <div className="d-flex flex-wrap gap-2">
                {locations.map((location, index) => (
                  <button
                    key={index}
                    className={`btn ${selectedLocations.includes(location) ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => {
                      const newLocations = selectedLocations.includes(location)
                        ? selectedLocations.filter(loc => loc !== location)
                        : [...selectedLocations, location];
                      if (newLocations.length > 0) {
                        setSelectedLocations(newLocations);
                      }
                    }}
                    style={{ fontSize: '14px' }}
                  >
                    {location}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <h6 className="mb-3">입항시간 선택 <span className="text-danger">*</span></h6>
              <select
                className="form-select"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
              >
                {hours.map((hour) => (
                  <option key={hour} value={hour}>{hour}시</option>
                ))}
              </select>
            </div>
          </div>

          <div className="card shadow-sm mb-3">
            <div className="card-body">
              <h6 className="mb-3">글자크기</h6>
              <div className="d-flex gap-2">
                {['small', 'medium', 'large', 'xlarge'].map((size) => (
                  <button
                    key={size}
                    className={`btn flex-fill ${selectedFontSize === size ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => saveFontSizePreference(size)}
                    style={{ fontSize: '14px' }}
                  >
                    {size === 'small' ? '작게' : size === 'medium' ? '보통' : size === 'large' ? '크게' : '아주크게'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      </div>

      <div className="position-fixed bottom-0 start-0 end-0 bg-white border-top p-3 shadow-lg">
        <div className="container">
          <div className="row g-2">
            <div className="col-6">
              <button
                className="btn btn-secondary w-100"
                onClick={() => router.back()}
                disabled={savingImage}
              >
                이전
              </button>
            </div>
            <div className="col-6">
              <button
                className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
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
                  <span>다음</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LocationTimeSelectionPage() {
  return (
    <Suspense fallback={
      <div className="d-flex min-vh-100 align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">로딩 중...</p>
        </div>
      </div>
    }>
      <LocationTimeSelectionContent />
    </Suspense>
  );
}

