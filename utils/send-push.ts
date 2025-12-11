import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const notifyAllAdmins = async (message: string, title: string = '알림', screen: string = 'admin-main') => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const adminList = snapshot.docs
      .map(doc => doc.data())
      .filter(user => user.isAdmin && user.expoPushToken);

    for (const admin of adminList) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: admin.expoPushToken,
          sound: 'default',
          title: title,
          body: message,
          data: {
            screen: screen,
          },
        }),
      });
    }

    console.log(`✅ 관리자에게 알림 전송 완료: ${title}`);
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
  data?: Record<string, any>;
}) => {
  try {
    const snap = await getDoc(doc(db, 'users', uuid));

    if (!snap.exists()) {
      console.warn('회원 없음:', uuid);
      // 웹에서는 Alert 대신 console.warn 사용
      return;
    }

    const expoPushToken = snap.data().expoPushToken;

    if (!expoPushToken) {
      console.warn('❗푸시 토큰 없음:', uuid);
      return;
    }

    const payload = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    console.log('푸시 페이로드:', payload);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('푸시 응답 상태:', response.status);
    const text = await response.text();
    console.log('푸시 응답 본문:', text);

    if (!response.ok) {
      console.error('푸시 전송 실패');
    }
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
  data?: Record<string, any>;
}) => {
  try {
    const snapshot = await getDocs(collection(db, 'users'));

    const userList = snapshot.docs
      .map(doc => doc.data())
      .filter(user => user.expoPushToken);

    if (userList.length === 0) {
      console.warn('푸시 토큰이 있는 사용자가 없습니다.');
      return;
    }

    for (const user of userList) {
      const payload = {
        to: user.expoPushToken,
        sound: 'default',
        title,
        body,
        data,
      };

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    console.log(`✅ ${userList.length}명에게 전체 푸시 전송 완료`);
  } catch (error) {
    console.error('❗전체 푸시 전송 실패:', error);
  }
};

