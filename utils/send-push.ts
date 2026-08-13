import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { isFirebaseDataSource } from '@/lib/data-source';
import { getFirebaseDb } from '@/lib/firebase/client';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { createAdminClient } from '@/lib/supabase/admin';

function getProfilesClient() {
  if (typeof window !== 'undefined') {
    return getSupabaseBrowserClient();
  }
  return createAdminClient();
}

async function sendExpoPush(
  token: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('푸시 전송 실패:', response.status, text);
  }

  return response;
}

async function getAdminPushTokens(): Promise<string[]> {
  if (isFirebaseDataSource()) {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map((d) => d.data())
      .filter((u) => u.isAdmin === true && u.expoPushToken)
      .map((u) => String(u.expoPushToken));
  }

  const supabase = getProfilesClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('role', 'admin')
    .not('expo_push_token', 'is', null);

  if (error) {
    console.error('관리자 토큰 조회 실패:', error);
    return [];
  }

  return (data ?? [])
    .map((row: { expo_push_token: string | null }) => row.expo_push_token)
    .filter((token: string | null): token is string => Boolean(token));
}

async function getPushTokenForUser(uuid: string): Promise<string | null> {
  if (isFirebaseDataSource()) {
    const { resolveFirestoreUserId } = await import('@/lib/firebase/resolve-user-id');
    const fbUuid = (await resolveFirestoreUserId(uuid)) ?? uuid;
    const db = getFirebaseDb();
    const snap = await getDoc(doc(db, 'users', fbUuid));
    if (!snap.exists()) return null;
    return snap.data().expoPushToken ?? null;
  }

  const supabase = getProfilesClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', uuid)
    .maybeSingle();

  if (error || !data?.expo_push_token) return null;
  return data.expo_push_token;
}

async function getAllPushTokens(): Promise<string[]> {
  if (isFirebaseDataSource()) {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs
      .map((d) => d.data().expoPushToken)
      .filter((token): token is string => Boolean(token));
  }

  const supabase = getProfilesClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .not('expo_push_token', 'is', null);

  if (error) {
    console.error('전체 토큰 조회 실패:', error);
    return [];
  }

  return (data ?? [])
    .map((row: { expo_push_token: string | null }) => row.expo_push_token)
    .filter((token: string | null): token is string => Boolean(token));
}

export const notifyAllAdmins = async (
  message: string,
  title: string = '알림',
  screen: string = 'admin-main'
) => {
  try {
    const tokens = [...new Set(await getAdminPushTokens())];

    for (const token of tokens) {
      await sendExpoPush(token, { title, body: message, data: { screen } });
    }

    console.log(`✅ 관리자에게 알림 전송 완료: ${title} (${tokens.length}명)`);
  } catch (err) {
    console.error('❗ 관리자 푸시 전송 실패:', err);
  }
};

export const sendPushToUser = async ({
  uuid,
  title,
  body,
  data = {},
}: {
  uuid: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) => {
  try {
    const expoPushToken = await getPushTokenForUser(uuid);

    if (!expoPushToken) {
      console.warn('❗푸시 토큰 없음:', uuid);
      return;
    }

    console.log('푸시 페이로드:', { to: expoPushToken, title, body, data });
    await sendExpoPush(expoPushToken, { title, body, data });
  } catch (error) {
    console.error('푸시 전송 에러:', error);
  }
};

export const sendPushToAllUsers = async ({
  title,
  body,
  data = {},
}: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) => {
  try {
    const tokens = [...new Set(await getAllPushTokens())];

    if (tokens.length === 0) {
      console.warn('푸시 토큰이 있는 사용자가 없습니다.');
      return;
    }

    for (const token of tokens) {
      await sendExpoPush(token, { title, body, data });
    }

    console.log(`✅ ${tokens.length}명에게 전체 푸시 전송 완료`);
  } catch (error) {
    console.error('❗전체 푸시 전송 실패:', error);
  }
};
