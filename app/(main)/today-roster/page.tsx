'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUser } from '@/lib/storage';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, getDay, eachDayOfInterval } from 'date-fns';
import { IoChevronBackOutline, IoChevronForwardOutline, IoCalendarOutline, IoStatsChartOutline } from 'react-icons/io5';
import PageHeader from '@/components/PageHeader';

type CachedMonth = {
  datesWithRoster: string[];
  confirmedTrips: Record<string, number[]>;
  timestamp: number;
};

export default function TodayRosterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [modalVisible, setModalVisible] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date | null>(null);
  const [datesWithRoster, setDatesWithRoster] = useState<string[]>([]);
  const [confirmedTrips, setConfirmedTrips] = useState<Record<string, number[]>>({});
  const [cachedMonths, setCachedMonths] = useState<Record<string, CachedMonth>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [totalConfirmedTrips, setTotalConfirmedTrips] = useState<number>(0);
  const [currentMonthTrips, setCurrentMonthTrips] = useState<number>(0);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
    };
    checkAuth();
    fetchTotalConfirmedTrips();
  }, [router]);

  useEffect(() => {
    fetchRosterData();
    fetchTotalConfirmedTrips();
  }, [currentMonth]);

  useEffect(() => {
    let count = 0;
    Object.values(confirmedTrips).forEach(trips => {
      count += trips.length;
    });
    setCurrentMonthTrips(count);
  }, [confirmedTrips]);

  const limitCacheSize = (cache: Record<string, CachedMonth>) => {
    const MAX_CACHE_SIZE = 3;
    if (Object.keys(cache).length <= MAX_CACHE_SIZE) return cache;
    
    const sortedEntries = Object.entries(cache).sort((a, b) => b[1].timestamp - a[1].timestamp);
    const limitedEntries = sortedEntries.slice(0, MAX_CACHE_SIZE);
    
    return Object.fromEntries(limitedEntries);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const startDay = getDay(monthStart);
  const blanks = Array(startDay).fill(null);

  const prevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const fetchRosterData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const monthKey = format(currentMonth, 'yyyy-MM');
      
      if (!forceRefresh && cachedMonths[monthKey]) {
        console.log('Using cached data for month:', monthKey);
        setDatesWithRoster(cachedMonths[monthKey].datesWithRoster);
        setConfirmedTrips(cachedMonths[monthKey].confirmedTrips);
        
        setCachedMonths(prev => {
          const updatedCache = {
            ...prev,
            [monthKey]: {
              ...prev[monthKey],
              timestamp: Date.now()
            }
          };
          return limitCacheSize(updatedCache);
        });
        
        setLoading(false);
        return;
      }
      
      const startDateStr = format(monthStart, 'yyyy-MM-dd');
      const endDateStr = format(monthEnd, 'yyyy-MM-dd');
      const datesArray = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const datesWithRosterArray: string[] = [];
      const confirmedTripsData: Record<string, number[]> = {};
      
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('__name__', '>=', startDateStr),
        where('__name__', '<=', endDateStr)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      
      const attendanceDates = new Map();
      attendanceSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.members && data.members.length > 0) {
          attendanceDates.set(doc.id, true);
        }
      });
      
      const tripsQuery = query(
        collection(db, 'trips'),
        where('__name__', '>=', startDateStr),
        where('__name__', '<=', endDateStr)
      );
      const tripsSnapshot = await getDocs(tripsQuery);
      
      const tripsDates = new Map();
      tripsSnapshot.forEach(doc => {
        const tripsData = doc.data();
        const confirmedForDate: number[] = [];
        
        interface TripData {
          confirmed: boolean;
          confirmedAt: string;
        }
        
        interface TripsDocData {
          [key: `trip${number}`]: TripData;
        }
        
        const typedTripsData = tripsData as TripsDocData;
        
        for (let i = 1; i <= 3; i++) {
          const tripKey = `trip${i}` as `trip${number}`;
          if (typedTripsData[tripKey] && typedTripsData[tripKey].confirmed) {
            confirmedForDate.push(i);
          }
        }
        
        if (confirmedForDate.length > 0) {
          tripsDates.set(doc.id, confirmedForDate);
        }
      });
      
      for (const date of datesArray) {
        const dateStr = format(date, 'yyyy-MM-dd');
        
        if (attendanceDates.has(dateStr)) {
          datesWithRosterArray.push(dateStr);
        }
        
        if (tripsDates.has(dateStr)) {
          confirmedTripsData[dateStr] = tripsDates.get(dateStr);
        }
      }
      
      setDatesWithRoster(datesWithRosterArray);
      setConfirmedTrips(confirmedTripsData);
      
      setCachedMonths(prev => {
        const updatedCache = {
          ...prev,
          [monthKey]: {
            datesWithRoster: datesWithRosterArray,
            confirmedTrips: confirmedTripsData,
            timestamp: Date.now()
          }
        };
        return limitCacheSize(updatedCache);
      });
      
    } catch (error) {
      console.error('Error fetching roster data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTotalConfirmedTrips = async () => {
    try {
      const viewYear = currentMonth.getFullYear();
      const yearStart = `${viewYear}-01-01`;
      const yearEnd = `${viewYear}-12-31`;
      
      const tripsQuery = query(
        collection(db, 'trips'),
        where('__name__', '>=', yearStart),
        where('__name__', '<=', yearEnd)
      );
      const tripsSnapshot = await getDocs(tripsQuery);
      
      let totalCount = 0;
      
      tripsSnapshot.forEach(doc => {
        const tripsData = doc.data();
        
        interface TripData {
          confirmed: boolean;
          confirmedAt: string;
        }
        
        interface TripsDocData {
          [key: `trip${number}`]: TripData;
        }
        
        const typedTripsData = tripsData as TripsDocData;
        
        for (let i = 1; i <= 3; i++) {
          const tripKey = `trip${i}` as `trip${number}`;
          if (typedTripsData[tripKey] && typedTripsData[tripKey].confirmed) {
            totalCount++;
          }
        }
      });
      
      setTotalConfirmedTrips(totalCount);
    } catch (error) {
      console.error('Error fetching total confirmed trips:', error);
    }
  };

  const handleDateClick = (day: Date) => {
    setTempSelectedDate(day);
    setModalVisible(true);
  };

  const isDateBeforeToday = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  const handleTripSelection = async (tripNumber: number) => {
    if (tempSelectedDate) {
      const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
      const dateDisplay = format(tempSelectedDate, 'yyyy년 MM월 dd일');
      
      router.push(`/roster-list?date=${dateStr}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}`);
      setModalVisible(false);
    }
  };

  const handleTripClick = async (tripNumber: number) => {
    if (!tempSelectedDate) return;
    
    const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
    const confirmedForDate = confirmedTrips[dateStr] || [];
    
    if (confirmedForDate.includes(tripNumber)) {
      const tripsDocRef = doc(db, 'trips', dateStr);
      const tripsDocSnap = await getDoc(tripsDocRef);
      
      if (tripsDocSnap.exists()) {
        const tripData = tripsDocSnap.data()[`trip${tripNumber}`];
        
        if (tripData && tripData.rosterImageUrl) {
          router.push(`/roster-preview?imageUri=${encodeURIComponent(tripData.rosterImageUrl)}&date=${dateStr}&tripNumber=${tripNumber}`);
        } else {
          const dateDisplay = format(tempSelectedDate, 'yyyy년 MM월 dd일');
          router.push(`/roster-list?date=${dateStr}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}&showPreview=true`);
        }
      } else {
        const dateDisplay = format(tempSelectedDate, 'yyyy년 MM월 dd일');
        router.push(`/roster-list?date=${dateStr}&dateDisplay=${encodeURIComponent(dateDisplay)}&tripNumber=${tripNumber}&showPreview=true`);
      }
    } else {
      handleTripSelection(tripNumber);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRosterData(true);
    await fetchTotalConfirmedTrips();
    setRefreshing(false);
  };


  return (
    <div 
      className="min-vh-100 bg-light"
      style={{ 
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        height: '100vh',
      }}
    >
      <PageHeader title="명부 관리" />
      <div className="container">
        <div className="card shadow-sm mb-3">
          <div className="card-body position-relative">
            {loading && (
              <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75 rounded" style={{ zIndex: 10 }}>
                <div className="text-center">
                  <div className="spinner-border text-primary mb-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="small text-muted mb-0">명부 정보를 불러오는 중...</p>
                </div>
              </div>
            )}
            
            <div className="d-flex justify-content-between align-items-center mb-4">
              <button
                className="btn btn-outline-primary rounded-circle d-flex align-items-center justify-content-center"
                onClick={prevMonth}
                disabled={loading}
                style={{ width: '40px', height: '40px' }}
              >
                <IoChevronBackOutline size={20} />
              </button>
              <h4 className="mb-0 fw-bold text-primary">{format(currentMonth, 'yyyy년 MM월')}</h4>
              <button
                className="btn btn-outline-primary rounded-circle d-flex align-items-center justify-content-center"
                onClick={nextMonth}
                disabled={loading}
                style={{ width: '40px', height: '40px' }}
              >
                <IoChevronForwardOutline size={20} />
              </button>
            </div>

            <div className="row g-0 mb-2 pb-2 border-bottom">
              {dayNames.map((day, index) => (
                <div key={index} className="col text-center py-2">
                  <small className={`fw-bold ${
                    index === 0 ? 'text-danger' : 
                    index === 6 ? 'text-primary' : 
                    'text-dark'
                  }`} style={{ fontSize: '0.875rem' }}>
                    {day}
                  </small>
                </div>
              ))}
            </div>

            <div className="row g-1" style={{ minHeight: '420px' }}>
              {blanks.map((_, index) => (
                <div key={`blank-${index}`} className="col p-1" style={{ flex: '0 0 14.2857%', maxWidth: '14.2857%' }}>
                  <div style={{ aspectRatio: '1', minHeight: '60px' }}></div>
                </div>
              ))}
              
              {days.map((day, index) => {
                const dayOfWeek = getDay(day);
                const dateStr = format(day, 'yyyy-MM-dd');
                const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                const isPastDate = isDateBeforeToday(new Date(day));
                const confirmedForDate = confirmedTrips[dateStr] || [];
                const hasTrips = confirmedForDate.length > 0;
                
                return (
                  <div
                    key={index}
                    className="col p-1"
                    style={{ flex: '0 0 14.2857%', maxWidth: '14.2857%' }}
                  >
                    <button
                      className={`btn w-100 p-2 d-flex flex-column align-items-center justify-content-center position-relative ${
                        isToday ? 'border-primary border-2' : 'border'
                      } ${isPastDate ? 'bg-light' : 'bg-white'} ${hasTrips ? 'shadow-sm' : ''}`}
                      onClick={() => !loading && handleDateClick(day)}
                      disabled={loading}
                      style={{ 
                        aspectRatio: '1',
                        height: '100%',
                        minHeight: '60px',
                        borderRadius: '8px',
                        transition: 'all 0.2s ease',
                        borderColor: isToday ? '#0d6efd' : '#dee2e6',
                        backgroundColor: isPastDate ? '#f8f9fa' : isToday ? '#e7f3ff' : '#ffffff',
                      }}
                      onMouseEnter={(e) => {
                        if (!isPastDate && !loading) {
                          e.currentTarget.style.backgroundColor = isToday ? '#cfe2ff' : '#f8f9fa';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isPastDate && !loading) {
                          e.currentTarget.style.backgroundColor = isToday ? '#e7f3ff' : '#ffffff';
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }}
                    >
                      <span 
                        className={`fw-semibold ${
                          dayOfWeek === 0 ? 'text-danger' : 
                          dayOfWeek === 6 ? 'text-primary' : 
                          isToday ? 'text-primary' : 
                          isPastDate ? 'text-muted' :
                          'text-dark'
                        }`}
                        style={{ fontSize: isToday ? '1rem' : '0.9rem' }}
                      >
                        {format(day, 'd')}
                      </span>
                      <div className="d-flex align-items-center justify-content-center" style={{ height: '18px', marginTop: '2px' }}>
                        {hasTrips && (
                          <span
                            className={`badge ${confirmedForDate.length >= 2 ? 'bg-warning text-dark' : 'bg-success'}`}
                            style={{ 
                              fontSize: '0.65rem',
                              padding: '2px 6px',
                              minWidth: '20px',
                              height: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}
                            title={`${confirmedForDate.length}항차 확정`}
                          >
                            {confirmedForDate.length}
                          </span>
                        )}
                      </div>
                      {isToday && (
                        <div 
                          className="position-absolute top-0 start-50 translate-middle bg-primary text-white rounded-pill d-flex align-items-center justify-content-center px-2"
                          style={{ 
                            fontSize: '0.65rem',
                            fontWeight: 'bold',
                            transform: 'translate(-50%, -50%)',
                            lineHeight: '1.2',
                            height: '18px',
                            whiteSpace: 'nowrap'
                          }}
                          title="오늘"
                        >
                          오늘
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
              
              {/* 마지막 주의 빈 셀 채우기 */}
              {(() => {
                const totalCells = blanks.length + days.length;
                const remainingCells = 7 - (totalCells % 7);
                if (remainingCells < 7 && remainingCells > 0) {
                  return Array(remainingCells).fill(null).map((_, index) => (
                    <div key={`empty-${index}`} className="col p-1" style={{ flex: '0 0 14.2857%', maxWidth: '14.2857%' }}>
                      <div style={{ aspectRatio: '1', minHeight: '60px' }}></div>
                    </div>
                  ));
                }
                return null;
              })()}
            </div>
          </div>
        </div>

        <div className="card shadow-sm mb-3">
          <div className="card-body text-center">
            <p className="text-muted small mb-3">
              날짜를 선택하면 해당 날짜의 명부를 확인할 수 있습니다.
            </p>
            
            <div className="row g-3">
              <div className="col-6">
                <div className="card bg-white">
                  <div className="card-body">
                    <IoCalendarOutline size={24} className="text-primary mb-2" />
                    <p className="small text-muted mb-1">{format(currentMonth, 'M')}월 출항수</p>
                    <h4 className="mb-0">{currentMonthTrips.toLocaleString()}회</h4>
                  </div>
                </div>
              </div>
              <div className="col-6">
                <div className="card bg-white">
                  <div className="card-body">
                    <IoStatsChartOutline size={24} className="text-success mb-2" />
                    <p className="small text-muted mb-1">{currentMonth.getFullYear()}년 누적 출항수</p>
                    <h4 className="mb-0">{totalConfirmedTrips.toLocaleString()}회</h4>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 항차 선택 모달 */}
      {modalVisible && tempSelectedDate && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">{format(tempSelectedDate, 'yyyy년 MM월 dd일')}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setModalVisible(false)} style={{ opacity: 0.8 }}></button>
              </div>
              <div className="modal-body">
                {(() => {
                  const dateStr = format(tempSelectedDate, 'yyyy-MM-dd');
                  const confirmedForDate = confirmedTrips[dateStr] || [];
                  
                  return (
                    <div className="d-grid gap-2">
                      <button
                        className={`btn d-flex align-items-center justify-content-center ${
                          confirmedForDate.includes(1) ? 'btn-success' : 'btn-primary'
                        }`}
                        onClick={() => handleTripClick(1)}
                        style={{
                          padding: '12px',
                          fontSize: '1rem',
                          fontWeight: '500',
                          borderRadius: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        1항차 {confirmedForDate.includes(1) && '(확정)'}
                      </button>
                      <button
                        className={`btn d-flex align-items-center justify-content-center ${
                          confirmedForDate.includes(2) ? 'btn-success' : 'btn-primary'
                        }`}
                        onClick={() => handleTripClick(2)}
                        style={{
                          padding: '12px',
                          fontSize: '1rem',
                          fontWeight: '500',
                          borderRadius: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        2항차 {confirmedForDate.includes(2) && '(확정)'}
                      </button>
                      <button
                        className={`btn d-flex align-items-center justify-content-center ${
                          confirmedForDate.includes(3) ? 'btn-success' : 'btn-primary'
                        }`}
                        onClick={() => handleTripClick(3)}
                        style={{
                          padding: '12px',
                          fontSize: '1rem',
                          fontWeight: '500',
                          borderRadius: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        3항차 {confirmedForDate.includes(3) && '(확정)'}
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary d-flex align-items-center justify-content-center"
                  onClick={() => setModalVisible(false)}
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    borderRadius: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
