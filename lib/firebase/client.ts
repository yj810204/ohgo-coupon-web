import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function getFirebaseConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !appId) {
    throw new Error(
      'Firebase 환경 변수가 없습니다. NEXT_PUBLIC_FIREBASE_* 를 설정하거나 NEXT_PUBLIC_DATA_SOURCE=supabase 로 전환하세요.'
    );
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.appspot.com`,
    messagingSenderId: messagingSenderId || '',
    appId,
  };
}

/** firebase 모드에서만 초기화. 브라우저·Node(API route) 공용. */
export function getFirebaseDb(): Firestore {
  if (db) return db;

  if (!getApps().length) {
    app = initializeApp(getFirebaseConfig());
  } else {
    app = getApps()[0]!;
  }

  // 브라우저: IndexedDB 영속 캐시. Node(API route): 기본 getFirestore.
  // 서버 데이터는 변경하지 않으며, 로컬 캐시만 사용한다.
  if (typeof window === 'undefined') {
    db = getFirestore(app);
  } else {
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      // 이미 초기화된 경우(HMR 등) 기존 인스턴스 재사용
      db = getFirestore(app);
    }
  }

  return db;
}
