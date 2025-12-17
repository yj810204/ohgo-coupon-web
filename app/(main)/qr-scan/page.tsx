'use client';

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { addStamp } from '@/utils/stamp-service';
import { doc, getDoc, updateDoc, increment, collection, setDoc, arrayUnion, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Html5Qrcode } from 'html5-qrcode';
import PageHeader from '@/components/PageHeader';

function QRScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<{ uuid?: string; name?: string; dob?: string } | null>(null);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('#000');
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const scanAreaRef = useRef<HTMLDivElement>(null);

  const handleQRInput = useCallback(async (qrData: string) => {
    if (scanning || !user?.uuid || scanCompleted) return;
    setScanning(true);
    setIsScanning(true);
    setIsProcessing(true);

    // 스캔 성공 시 스캐너 완전히 중지
    const stopScanner = async () => {
      if (qrCodeRef.current) {
        try {
          await qrCodeRef.current.stop();
          qrCodeRef.current.clear();
          qrCodeRef.current = null;
          setScanCompleted(true);
        } catch (error) {
          console.warn('스캐너 중지 중 오류:', error);
          qrCodeRef.current = null;
          setScanCompleted(true);
        }
      }
    };

    try {
      // 특정 QR 코드 체크 (ohgo-coupon 참고)
      if (qrData === 'OHGO-STAMP-BOAT19033326262005') {
        try {
          await addStamp(user.uuid, 'QR');
          setMessage('✅ 스탬프가 적립되었습니다!');
          setMessageColor('#4caf50');
          
          // 스캐너 중지
          await stopScanner();
          setIsScanning(false);
          setScanning(false);
          setIsProcessing(false);

          setTimeout(() => {
            router.push(`/stamp?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`);
          }, 1500);
          return;
        } catch (e: any) {
          console.error('❗ 오류:', e.message);
          // 이미 처리된 경우 팝업으로 표시
          setErrorMessage(e.message || '적립 실패');
          setShowErrorModal(true);
          setIsScanning(false);
          setScanning(false);
          setIsProcessing(false);
          return;
        }
      }

      // Firestore의 qrCodes 컬렉션에서 QR 코드 검증
      const qrRef = doc(db, 'qrCodes', qrData);
      const qrSnap = await getDoc(qrRef);

      if (!qrSnap.exists()) {
        setMessage('❌ 유효하지 않은 QR 코드입니다.');
        setMessageColor('#f44336');
        setIsScanning(false);
        setScanning(false);
        setIsProcessing(false);
        return;
      }

      await addStamp(user.uuid, 'QR');
      setMessage('✅ 스탬프가 적립되었습니다!');
      setMessageColor('#4caf50');
      
      // 스캐너 중지
      await stopScanner();
      setIsScanning(false);
      setScanning(false);
      setIsProcessing(false);

      setTimeout(() => {
        router.push(`/stamp?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`);
      }, 1500);
    } catch (error: any) {
      // 이미 처리된 경우 팝업으로 표시
      setErrorMessage(error.message || '오류가 발생했습니다.');
      setShowErrorModal(true);
      setIsScanning(false);
      setScanning(false);
      setIsProcessing(false);
    }
  }, [scanning, user, router, scanCompleted]);

  useEffect(() => {
    const loadUser = async () => {
      const u = await getUser();
      if (!u?.uuid) {
        router.replace('/login');
        return;
      }
      setUser(u);
    };
    loadUser();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    // 카메라만 준비 (스캔은 시작하지 않음)
    const initCamera = async () => {
      setIsPreparing(true);
      try {
        const qrCode = new Html5Qrcode('qr-reader');
        qrCodeRef.current = qrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          videoConstraints: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          disableFlip: false,
        };

        // 후면 카메라 우선 시도 (병렬 처리로 속도 개선)
        let cameraId: string | null = null;
        try {
          const devices = await Html5Qrcode.getCameras();
          // 후면 카메라 찾기
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          cameraId = backCamera?.id || devices[0]?.id || null;
        } catch (err) {
          console.warn('카메라 목록 가져오기 실패, 기본 카메라 사용');
        }

        // 카메라 준비 완료 후 자동으로 스캔 모드로 시작
        await qrCode.start(
          cameraId || { facingMode: 'environment' },
          config,
          (decodedText) => {
            // 자동 스캔 활성화
            if (!scanCompleted && !scanning) {
              handleQRInput(decodedText);
            }
          },
          (errorMessage) => {
            // 스캔 중 오류 (무시)
          }
        );

        setCameraReady(true);
        setPermissionDenied(false);
        setIsPreparing(false);
        setIsScanning(true);
        setMessage('QR 코드를 카메라 중앙에 맞춰주세요');
      } catch (error: any) {
        console.error('카메라 초기화 실패:', error);
        setPermissionDenied(true);
        setIsPreparing(false);
        setMessage('❌ 카메라 접근 권한이 필요합니다.');
        setMessageColor('#f44336');
      }
    };

    initCamera();

    return () => {
      const cleanup = async () => {
        if (qrCodeRef.current) {
          try {
            await qrCodeRef.current.stop();
            qrCodeRef.current.clear();
          } catch (error) {
            try {
              qrCodeRef.current.clear();
            } catch (clearError) {
              console.warn('카메라 정리 중 오류:', clearError);
            }
          }
          qrCodeRef.current = null;
        }
      };
      cleanup();
    };
  }, [user, router, handleQRInput, scanCompleted, scanning]);

  // 스캔 시작 함수
  const handleStartScan = useCallback(async () => {
    if (isScanning || !cameraReady || scanCompleted) return;
    
    setIsScanning(true);
    setIsPreparing(true);
    setMessage('스캔 준비 중...');
    setMessageColor('#000');

    try {
      // 기존 스캐너 중지
      if (qrCodeRef.current) {
        try {
          await qrCodeRef.current.stop();
          qrCodeRef.current.clear();
        } catch (e) {
          // 이미 중지된 경우 무시
        }
      }

      // 스캔 모드로 재시작
      const qrCode = new Html5Qrcode('qr-reader');
      qrCodeRef.current = qrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        disableFlip: false,
      };

      let cameraId: string | null = null;
      try {
        const devices = await Html5Qrcode.getCameras();
        const backCamera = devices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environment')
        );
        cameraId = backCamera?.id || devices[0]?.id || null;
      } catch (err) {
        console.warn('카메라 목록 가져오기 실패');
      }

      await qrCode.start(
        cameraId || { facingMode: 'environment' },
        config,
        (decodedText) => {
          // 스캔 성공 시 한 번만 처리
          if (!scanCompleted) {
            handleQRInput(decodedText);
          }
        },
        (errorMessage) => {
          // 스캔 중 오류 (무시)
        }
      );

      setIsPreparing(false);
      setMessage('QR 코드를 카메라 중앙에 맞춰주세요');
    } catch (error: any) {
      console.error('스캔 시작 실패:', error);
      setIsScanning(false);
      setIsPreparing(false);
      setMessage('❌ 스캔을 시작할 수 없습니다.');
      setMessageColor('#f44336');
    }
  }, [isScanning, cameraReady, scanCompleted, handleQRInput]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  const handleRetryCamera = async () => {
    setPermissionDenied(false);
    setMessage('카메라 권한 요청 중...');
    setMessageColor('#000');
    
    // QR 스캐너 재초기화
    if (qrCodeRef.current) {
      try {
        await qrCodeRef.current.stop();
        qrCodeRef.current.clear();
      } catch (e) {
        // stop 실패 시에도 clear 시도
        try {
          qrCodeRef.current?.clear();
        } catch (clearError) {
          // clear 실패 무시
        }
      }
    }

    // 잠시 후 재시도
    setTimeout(() => {
      const initQRScanner = async () => {
        try {
          const qrCode = new Html5Qrcode('qr-reader');
          qrCodeRef.current = qrCode;

          const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            disableFlip: false,
          };

          let cameraId: string | null = null;
          try {
            const devices = await Html5Qrcode.getCameras();
            const backCamera = devices.find(device => 
              device.label.toLowerCase().includes('back') || 
              device.label.toLowerCase().includes('rear') ||
              device.label.toLowerCase().includes('environment')
            );
            cameraId = backCamera?.id || devices[0]?.id || null;
          } catch (err) {
            console.warn('카메라 목록 가져오기 실패');
          }

          await qrCode.start(
            cameraId || { facingMode: 'environment' },
            config,
            (decodedText) => {
              handleQRInput(decodedText);
            },
            () => {}
          );

          setCameraReady(true);
          setPermissionDenied(false);
          setMessage('QR 코드를 카메라 중앙에 맞춰주세요');
          setMessageColor('#000');
        } catch (error: any) {
          setPermissionDenied(true);
          setMessage('❌ 카메라 접근 권한이 필요합니다.');
          setMessageColor('#f44336');
        }
      };
      initQRScanner();
    }, 500);
  };

  return (
    <>
      <style jsx global>{`
        #qr-reader {
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          overflow: hidden !important;
        }
        #qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          transform: none !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          z-index: 1 !important;
        }
        #qr-reader video:not(:first-of-type) {
          display: none !important;
        }
        #qr-reader canvas {
          display: none !important;
        }
        #qr-reader__dashboard {
          display: none !important;
        }
        #qr-reader__scan_region {
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
        }
        #qr-reader__scan_region video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #qr-reader__scan_region video:not(:first-of-type) {
          display: none !important;
        }
      `}</style>
      <div className="bg-black flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, width: '100vw', height: '100vh' }}>
        <div className="flex-1 relative" ref={scanAreaRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <div id="qr-reader" style={{ width: '100%', height: '100%' }}></div>
        {isPreparing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50" style={{ zIndex: 3 }}>
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-lg font-semibold">준비 중...</p>
            </div>
          </div>
        )}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50" style={{ zIndex: 3 }}>
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-lg font-semibold">처리 중...</p>
            </div>
          </div>
        )}
        {cameraReady && !permissionDenied && !isPreparing && (
          <>
            {/* 음영 처리 오버레이 */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 2,
              }}
            >
              {/* 중앙 사각형 영역 (투명) */}
              <div 
                className="absolute"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '250px',
                  height: '250px',
                  border: '4px solid white',
                  borderRadius: '8px',
                  boxShadow: '0 0 0 99999px rgba(0, 0, 0, 0.6)',
                }}
              ></div>
              {/* 안내 문구 */}
              <div 
                className="absolute text-white text-center"
                style={{
                  top: 'calc(50% - 180px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '90%',
                  maxWidth: '300px',
                }}
              >
                <p className="fw-semibold mb-2" style={{ fontSize: '1rem' }}>
                  QR 코드를 스캔하세요
                </p>
                <p className="small text-gray-300" style={{ fontSize: '0.85rem', lineHeight: '1.5' }}>
                  휴대폰 카메라로 QR 코드를<br />
                  중앙 사각형 안에 맞춰주세요
                </p>
              </div>
            </div>
          </>
        )}
        {permissionDenied && (
          <div className="absolute inset-0 d-flex align-items-center justify-content-center bg-black bg-opacity-75">
            <div className="text-center text-white p-4" style={{ maxWidth: '90%' }}>
              <p className="mb-4 fw-bold" style={{ fontSize: '1.1rem' }}>카메라 권한이 필요합니다</p>
              <p className="text-sm mb-4 text-gray-300" style={{ lineHeight: '1.6' }}>
                QR 코드를 스캔하기 위해 휴대폰 카메라 접근 권한이 필요합니다.
              </p>
              <button
                onClick={handleRetryCamera}
                className="btn btn-primary"
                style={{
                  borderRadius: '12px',
                  padding: '12px 24px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  border: 'none',
                }}
              >
                다시 시도
              </button>
            </div>
        </div>
        )}
      </div>
      
      <div className="bg-white p-4" style={{ borderTop: '1px solid #dee2e6' }}>
        {message && (
          <p className="text-center fw-semibold mb-3" style={{ color: messageColor, fontSize: '1rem' }}>
            {message}
          </p>
        )}
        <button
          onClick={() => router.back()}
          className="btn btn-secondary w-100"
          style={{
            borderRadius: '12px',
            padding: '14px',
            fontSize: '1rem',
            fontWeight: '600',
            border: 'none',
          }}
        >
          뒤로 가기
        </button>
      </div>
      
      {/* 에러 모달 */}
      {showErrorModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
              <div className="modal-header border-0" style={{ 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '20px'
              }}>
                <h5 className="modal-title text-white fw-bold mb-0">알림</h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={() => {
                    setShowErrorModal(false);
                    setErrorMessage('');
                  }}
                  style={{ opacity: 0.8 }}
                ></button>
              </div>
              <div className="modal-body p-4">
                <p className="text-center mb-0" style={{ lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                  {errorMessage}
                </p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button
                  onClick={() => {
                    setShowErrorModal(false);
                    setErrorMessage('');
                    // 스탬프 화면으로 이동
                    if (user?.uuid) {
                      router.push(`/stamp?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`);
                    } else {
                      router.back();
                    }
                  }}
                  className="btn btn-primary w-100 text-white fw-semibold"
                  style={{
                    borderRadius: '12px',
                    padding: '12px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                  }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default function QRScanPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    }>
      <QRScanPageContent />
    </Suspense>
  );
}

