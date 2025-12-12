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
  const [message, setMessage] = useState('QR 코드를 스캔해주세요');
  const [messageColor, setMessageColor] = useState('#000');
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const scanAreaRef = useRef<HTMLDivElement>(null);

  const handleQRInput = useCallback(async (qrData: string) => {
    if (scanning || !user?.uuid) return;
    setScanning(true);

    try {
      // QR 코드 검증 및 스탬프 적립
      const qrRef = doc(db, 'qrCodes', qrData);
      const qrSnap = await getDoc(qrRef);

      if (!qrSnap.exists()) {
        setMessage('❌ 유효하지 않은 QR 코드입니다.');
        setMessageColor('#f44336');
        setScanning(false);
        return;
      }

      await addStamp(user.uuid, 'QR');
      setMessage('✅ 스탬프가 적립되었습니다!');
      setMessageColor('#4caf50');

      setTimeout(() => {
        router.push(`/stamp?uuid=${user.uuid}&name=${user.name}&dob=${user.dob}`);
      }, 1500);
    } catch (error: any) {
      setMessage('❌ 오류: ' + error.message);
      setMessageColor('#f44336');
      setScanning(false);
    }
  }, [scanning, user, router]);

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

    // QR 코드 스캐너 초기화
    const initQRScanner = async () => {
      try {
        const qrCode = new Html5Qrcode('qr-reader');
        qrCodeRef.current = qrCode;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        // 후면 카메라 우선 시도
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

        await qrCode.start(
          cameraId || { facingMode: 'environment' },
          config,
          (decodedText) => {
            // QR 코드 스캔 성공
            handleQRInput(decodedText);
          },
          (errorMessage) => {
            // 스캔 중 오류 (무시)
          }
        );

        setCameraReady(true);
        setPermissionDenied(false);
      } catch (error: any) {
        console.error('QR 스캐너 초기화 실패:', error);
        setPermissionDenied(true);
        setMessage('❌ 카메라 접근 권한이 필요합니다.');
        setMessageColor('#f44336');
      }
    };

    initQRScanner();

    return () => {
      const cleanup = async () => {
        if (qrCodeRef.current) {
          try {
            // 먼저 스캔 중지
            await qrCodeRef.current.stop();
            // stop이 완료된 후에만 clear 호출
            qrCodeRef.current.clear();
          } catch (error) {
            // stop 실패 시 (이미 정지되었거나 오류 발생)
            try {
              // clear만 시도
              qrCodeRef.current.clear();
            } catch (clearError) {
              // clear도 실패하면 무시 (이미 정리된 경우)
              console.warn('QR 스캐너 정리 중 오류:', clearError);
            }
          }
          qrCodeRef.current = null;
        }
      };
      cleanup();
    };
  }, [user, router, handleQRInput]);

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
          setMessage('QR 코드를 스캔해주세요');
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
    <div className="bg-black flex flex-col" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, width: '100vw', height: '100vh' }}>
      <div className="flex-1 relative" ref={scanAreaRef} style={{ width: '100%', height: '100%' }}>
        <div id="qr-reader" style={{ width: '100%', height: '100%' }}></div>
        {cameraReady && !permissionDenied && (
          <div className="absolute inset-0 flex items-center justify-content-center pointer-events-none">
            <div className="border-4 border-white rounded-lg" style={{ width: '250px', height: '250px' }}></div>
          </div>
        )}
        {permissionDenied && (
          <div className="absolute inset-0 flex items-center justify-content-center bg-black bg-opacity-75">
            <div className="text-center text-white p-4">
              <p className="mb-4">카메라 권한이 필요합니다</p>
              <p className="text-sm mb-4 text-gray-300">
                브라우저 주소창 옆의 자물쇠 아이콘을 클릭하여<br />
                카메라 권한을 허용해주세요.
              </p>
              <button
                onClick={handleRetryCamera}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
              >
                다시 시도
              </button>
            </div>
        </div>
        )}
      </div>
      
      <div className="bg-white p-4">
        {message && (
          <p className="text-center font-semibold mb-3" style={{ color: messageColor }}>
            {message}
          </p>
        )}
        <button
          onClick={() => router.back()}
          className="w-full mt-2 bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700"
        >
          뒤로 가기
        </button>
      </div>
    </div>
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

