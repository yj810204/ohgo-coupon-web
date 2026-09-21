import assert from 'node:assert/strict';
import { firebaseQrStampWriteFields } from './firebase-qr-stamp.ts';

const stampedAt = new Date('2026-09-21T12:00:00+09:00');
const doc = firebaseQrStampWriteFields({ date: '2026-09-21', timestamp: stampedAt });

assert.equal(doc.method, 'QR');
assert.equal(doc.date, '2026-09-21');
assert.equal(doc.timestamp, stampedAt);
assert.equal(
  doc.processedByServer,
  true,
  '구 CF가 명부 선등록 회원의 QR 스탬프를 삭제하지 않도록 processedByServer=true'
);

console.log('firebase-qr-stamp tests passed');
