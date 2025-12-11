// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDvcQMMs5-B9LJanDPLMOqTkwd3KMUg2u4",
  authDomain: "ohgo-dev-bc602.firebaseapp.com",
  projectId: "ohgo-dev-bc602",
  storageBucket: "ohgo-dev-bc602.firebasestorage.app",
  messagingSenderId: "50117397680",
  appId: "1:50117397680:web:c15a4565cff2b4669dbf75"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };

