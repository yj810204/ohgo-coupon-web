'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { addStamp } from '@/utils/stamp-service';
import { doc, getDoc, updateDoc, increment, collection, setDoc, arrayUnion, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// 거리 계산 함수
function getDistanceFromLatLngInKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function QRScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<{ uuid?: string; name?: string; dob?: string } | null>(null);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('#000');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    // 웹 카메라 초기화
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (error) {
        alert('카메라 접근 권한이 필요합니다.');
        router.back();
      }
    };
    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [router]);

  const fetchTargetLocation = async (): Promise<{ lat: number; lng: number; limit: number }> => {
    const ref = doc(db, 'config', 'location');
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('기준 위치 정보가 존재하지 않습니다.');
    const data = snap.data();

    console.log('📍 기준 위치:', data.lat, data.lng, '제한 거리:', data.limitDistanceKm);
    return {
      lat: data.lat,
      lng: data.lng,
      limit: data.limitDistanceKm || 0.3,
    };
  };

  const handleQRInput = async (qrData: string) => {
    if (scanning || !user?.uuid) return;
    setScanning(true);

    try {
      // 위치 확인
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;
      const target = await fetchTargetLocation();
      const distance = getDistanceFromLatLngInKm(latitude, longitude, target.lat, target.lng);

      if (distance > target.limit) {
        setMessage(`❌ 위치가 기준 위치에서 ${distance.toFixed(2)}km 떨어져 있습니다. (제한: ${target.limit}km)`);
        setMessageColor('#f44336');
        setScanning(false);
        return;
      }

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
  };

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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-4 border-white rounded-lg w-64 h-64"></div>
        </div>
      </div>
      
      <div className="bg-white p-4">
        <input
          type="text"
          placeholder="QR 코드 데이터를 입력하거나 스캔하세요"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleQRInput(e.currentTarget.value);
              e.currentTarget.value = '';
            }
          }}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-2"
        />
        {message && (
          <p className="text-center font-semibold" style={{ color: messageColor }}>
            {message}
          </p>
        )}
        <button
          onClick={() => router.back()}
          className="w-full mt-4 bg-gray-600 text-white py-3 rounded-lg font-semibold hover:bg-gray-700"
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

