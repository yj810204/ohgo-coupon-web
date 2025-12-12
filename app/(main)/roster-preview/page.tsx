'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { IoCloseOutline, IoDownloadOutline, IoCheckmarkCircleOutline } from 'react-icons/io5';
import { doc, getDoc, updateDoc, setDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

function RosterPreviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageUri = searchParams.get('imageUri');
  const date = searchParams.get('date');
  const tripNumber = searchParams.get('tripNumber');
  const fontSize = searchParams.get('fontSize');

  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  
  // Zoom and pan state
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tripNum = tripNumber ? parseInt(tripNumber) : 1;

  // Check confirmation status
  useEffect(() => {
    const checkConfirmationStatus = async () => {
      if (!date || !tripNumber) return;

      try {
        const dateStr = date as string;
        const tripNum = parseInt(tripNumber as string, 10);
        const tripKey = `trip${tripNum}` as `trip${number}`;

        const tripsDocRef = doc(db, 'trips', dateStr);
        const tripsDocSnap = await getDoc(tripsDocRef);

        if (tripsDocSnap.exists()) {
          const data = tripsDocSnap.data();
          if (data[tripKey] && data[tripKey].confirmed === true) {
            setIsConfirmed(true);
          }
        }
      } catch (error) {
        console.error('Error checking confirmation status:', error);
      }
    };

    checkConfirmationStatus();
  }, [date, tripNumber]);

  // Handle image load
  const handleImageLoad = () => {
    setLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setLoading(false);
    setImageError(true);
  };

  // Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    if (!imageRef.current || !containerRef.current) return;
    
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.5, Math.min(5, scale + delta));
    
    if (newScale !== scale) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const newX = mouseX - (mouseX - position.x) * (newScale / scale);
      const newY = mouseY - (mouseY - position.y) * (newScale / scale);
      
      setScale(newScale);
      setPosition({ x: newX, y: newY });
      setIsZoomed(newScale > 1);
    }
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Reset zoom
  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsZoomed(false);
  };

  // Download image
  const handleDownload = async () => {
    if (!imageUri) return;

    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${date}_${tripNumber}항차_명부.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('이미지 다운로드 중 오류가 발생했습니다.');
    }
  };

  // Confirm departure
  const confirmDeparture = async () => {
    if (!date || !tripNumber || !imageUri) {
      alert('날짜 또는 항차 정보가 없습니다.');
      return;
    }

    if (!confirm('출항을 확정하시겠습니까?\n주의: 출항을 확정하면 수정이 불가능합니다.')) {
      return;
    }

    try {
      setSavingImage(true);

      // Upload image to Firebase Storage
      try {
        const response = await fetch(imageUri);
        const blob = await response.blob();

        const dateStr = date as string;
        const tripNum = parseInt(tripNumber as string, 10);
        const imagePath = `rosters/${dateStr}/trip${tripNum}.jpg`;
        const storageRef = ref(storage, imagePath);

        await uploadBytes(storageRef, blob);
        const downloadURL = await getDownloadURL(storageRef);
        console.log('Image uploaded to Firebase Storage successfully:', downloadURL);

        // Store confirmation in Firestore
        const tripsDocRef = doc(db, 'trips', dateStr);
        const tripsDocSnap = await getDoc(tripsDocRef);
        const tripKey = `trip${tripNum}` as `trip${number}`;

        interface TripData {
          confirmed: boolean;
          confirmedAt: string;
          rosterImagePath?: string;
          rosterImageUrl?: string;
        }

        interface TripsDocData {
          [key: `trip${number}`]: TripData;
        }

        if (tripsDocSnap.exists()) {
          const updatedData: Partial<TripsDocData> = {
            [tripKey]: {
              confirmed: true,
              confirmedAt: new Date().toISOString(),
              rosterImagePath: imagePath,
              rosterImageUrl: downloadURL
            }
          };
          await updateDoc(tripsDocRef, updatedData);
        } else {
          const newData: TripsDocData = {
            [tripKey]: {
              confirmed: true,
              confirmedAt: new Date().toISOString(),
              rosterImagePath: imagePath,
              rosterImageUrl: downloadURL
            }
          };
          await setDoc(tripsDocRef, newData);
        }
      } catch (error) {
        console.error('Error uploading image to Firebase Storage:', error);
        // Continue with confirmation even if image upload fails
      }

      // Delete members field from attendance document
      try {
        const dateStr = date as string;
        const attendanceRef = doc(db, 'attendance', dateStr);
        const attendanceSnap = await getDoc(attendanceRef);

        if (attendanceSnap.exists()) {
          await updateDoc(attendanceRef, {
            members: deleteField()
          });
          console.log('Members field deleted from attendance document for date:', dateStr);
        }
      } catch (error) {
        console.error('Error deleting members field from attendance document:', error);
      }

      alert('출항이 확정되었습니다. 승선명부 이미지가 서버에 저장되었습니다.');
      router.push('/today-roster');
    } catch (error) {
      console.error('Error in confirmDeparture:', error);
      alert('출항 확정 정보를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setSavingImage(false);
    }
  };

  return (
    <div 
      className="min-vh-100 bg-dark d-flex align-items-center justify-content-center position-relative"
      style={{ overflow: 'hidden' }}
    >
      {/* Header */}
      <div className="position-absolute top-0 start-0 end-0 d-flex justify-content-between align-items-center p-3" style={{ zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <div className="d-flex align-items-center">
          <button
            type="button"
            className="btn btn-link p-0 me-3"
            onClick={() => router.back()}
            style={{ 
              border: 'none', 
              background: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              lineHeight: 1
            }}
          >
            <IoCloseOutline size={24} />
          </button>
          <h5 className="text-white mb-0">명부 이미지 미리보기</h5>
        </div>
        <div className="d-flex gap-2">
          {isZoomed && (
            <button
              className="btn btn-light btn-sm"
              onClick={resetZoom}
              title="줌 초기화"
            >
              리셋
            </button>
          )}
          <button
            className="btn btn-light btn-sm"
            onClick={handleDownload}
            disabled={!imageUri || loading}
            title="다운로드"
          >
            <IoDownloadOutline size={20} />
          </button>
          <button
            className="btn btn-light btn-sm"
            onClick={() => router.back()}
            title="닫기"
          >
            <IoCloseOutline size={20} />
          </button>
        </div>
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="position-relative"
        style={{
          width: '100%',
          height: '100vh',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default'
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && (
          <div className="position-absolute top-50 start-50 translate-middle text-white">
            <div className="spinner-border mb-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="small">이미지를 불러오는 중...</p>
          </div>
        )}

        {imageError && (
          <div className="position-absolute top-50 start-50 translate-middle text-center text-white">
            <p>이미지를 불러올 수 없습니다.</p>
            <p className="small text-muted">이미지 서버에 일시적인 문제가 있을 수 있습니다.</p>
            <button className="btn btn-light mt-2" onClick={() => router.back()}>
              돌아가기
            </button>
          </div>
        )}

        {imageUri && !imageError && (
          <img
            ref={imageRef}
            src={imageUri}
            alt={`${date} ${tripNumber}항차 명부`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          />
        )}
      </div>

      {/* Footer Buttons */}
      <div className="position-absolute bottom-0 start-0 end-0 p-3 bg-dark bg-opacity-75">
        <div className="container">
          <div className="row g-2">
            <div className={isConfirmed ? 'col-12' : 'col-6'}>
              <button
                className="btn btn-secondary w-100"
                onClick={() => router.back()}
                disabled={savingImage}
              >
                이전
              </button>
            </div>
            {!isConfirmed && (
              <div className="col-6">
                <button
                  className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                  onClick={confirmDeparture}
                  disabled={savingImage}
                >
                  {savingImage ? (
                    <>
                      <div className="spinner-border spinner-border-sm" role="status">
                        <span className="visually-hidden">저장 중...</span>
                      </div>
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <IoCheckmarkCircleOutline size={20} />
                      <span>출항 확정</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {isConfirmed && (
              <div className="col-12">
                <div className="alert alert-success mb-0 text-center py-2">
                  <IoCheckmarkCircleOutline size={20} className="me-2" />
                  출항이 확정되었습니다
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RosterPreviewPage() {
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
      <RosterPreviewContent />
    </Suspense>
  );
}

