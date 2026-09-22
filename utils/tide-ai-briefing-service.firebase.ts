import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import {
  briefingFromUnknown,
  TIDE_AI_BRIEFING_COLLECTION,
  type TideAiBriefing,
} from '@/utils/tide-ai-briefing-shared';

export async function getTideAiBriefing(date: string): Promise<TideAiBriefing | null> {
  const snap = await getDoc(doc(getFirebaseDb(), TIDE_AI_BRIEFING_COLLECTION, date));
  if (!snap.exists()) return null;
  return briefingFromUnknown({ ...snap.data(), date: snap.id });
}

export async function publishTideAiBriefing(briefing: TideAiBriefing): Promise<TideAiBriefing> {
  const existing = await getTideAiBriefing(briefing.date);
  const next: TideAiBriefing = {
    ...briefing,
    publishedAt: existing?.publishedAt || briefing.publishedAt,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(getFirebaseDb(), TIDE_AI_BRIEFING_COLLECTION, next.date), next, { merge: true });
  return next;
}
