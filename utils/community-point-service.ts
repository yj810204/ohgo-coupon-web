import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// 기본 포인트 적립 규칙 (설정이 없을 때 사용)
const DEFAULT_POINTS_PER_COMMENT = 1;
const DEFAULT_DAILY_POINT_LIMIT = 10;

/**
 * Firestore에서 포인트 설정 조회
 */
async function getPointSettings(): Promise<{ pointsPerComment: number; dailyLimit: number }> {
  try {
    const configRef = doc(db, 'config', 'communityPoints');
    const configSnap = await getDoc(configRef);
    
    if (configSnap.exists()) {
      const data = configSnap.data();
      return {
        pointsPerComment: data.pointsPerComment ?? DEFAULT_POINTS_PER_COMMENT,
        dailyLimit: data.dailyLimit ?? DEFAULT_DAILY_POINT_LIMIT,
      };
    }
    
    // 설정이 없으면 기본값 반환
    return {
      pointsPerComment: DEFAULT_POINTS_PER_COMMENT,
      dailyLimit: DEFAULT_DAILY_POINT_LIMIT,
    };
  } catch (error) {
    console.error('Error getting point settings:', error);
    // 오류 시 기본값 반환
    return {
      pointsPerComment: DEFAULT_POINTS_PER_COMMENT,
      dailyLimit: DEFAULT_DAILY_POINT_LIMIT,
    };
  }
}

/**
 * 사용자가 특정 게시글에 작성한 댓글 조회 (현재 작성 중인 댓글 제외)
 * 같은 게시글에 이미 댓글을 달았는지 확인하기 위해 사용
 */
async function getCommentsByUserAndPhoto(
  userId: string, 
  photoId: string, 
  excludeCommentId?: string
): Promise<Array<{ commentId: string; pointAwarded: number }>> {
  try {
    const commentsRef = collection(db, 'communityPhotos', photoId, 'comments');
    const q = query(commentsRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs
      .filter(doc => doc.id !== excludeCommentId) // 현재 작성 중인 댓글 제외
      .map(doc => {
        const data = doc.data();
        return {
          commentId: doc.id,
          pointAwarded: data.pointAwarded || 0,
        };
      });
  } catch (error) {
    console.error('Error getting comments by user and photo:', error);
    return [];
  }
}

/**
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD)
 */
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 오늘 날짜의 시작과 끝 Timestamp 반환
 */
function getTodayRange(): { start: Timestamp; end: Timestamp } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
  };
}

/**
 * 오늘 적립된 포인트 조회
 */
async function getTodayPoints(userId: string): Promise<number> {
  try {
    const today = getTodayDate();
    const communityPointsRef = collection(db, `users/${userId}/communityPoints`);
    const q = query(communityPointsRef, where('date', '==', today));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return 0;
    }
    
    const todayDoc = snapshot.docs[0];
    return todayDoc.data().totalPoints || 0;
  } catch (error) {
    console.error('Error getting today points:', error);
    return 0;
  }
}

/**
 * 오늘 적립된 포인트 업데이트
 */
async function updateTodayPoints(userId: string, pointsToAdd: number): Promise<void> {
  try {
    const today = getTodayDate();
    const communityPointsRef = doc(db, `users/${userId}/communityPoints`, today);
    const docSnap = await getDoc(communityPointsRef);
    
    if (docSnap.exists()) {
      const currentData = docSnap.data();
      await updateDoc(communityPointsRef, {
        totalPoints: (currentData.totalPoints || 0) + pointsToAdd,
        commentCount: (currentData.commentCount || 0) + 1,
        lastUpdated: Timestamp.now(),
      });
    } else {
      await setDoc(communityPointsRef, {
        date: today,
        totalPoints: pointsToAdd,
        commentCount: 1,
        lastUpdated: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error('Error updating today points:', error);
    throw error;
  }
}

/**
 * 댓글 작성 시 포인트 적립
 * @param userId 사용자 UUID
 * @param photoId 사진 ID
 * @param commentId 댓글 ID
 * @param photoUploadedBy 사진 작성자 UUID (본인 작성글 체크용)
 * @returns 적립된 포인트 (0이면 적립 상한 도달 또는 정책 위반)
 */
export async function awardCommentPoints(
  userId: string,
  photoId: string,
  commentId: string,
  photoUploadedBy?: string
): Promise<{ points: number; totalPoints: number; isLimitReached: boolean; reason?: string }> {
  try {
    // 정책 1: 본인 작성글에 댓글 달면 포인트 적립 안됨
    if (photoUploadedBy && photoUploadedBy === userId) {
      return {
        points: 0,
        totalPoints: 0,
        isLimitReached: false,
        reason: '본인 작성글에는 포인트가 적립되지 않습니다.',
      };
    }
    
    // 정책 2: 같은 게시글에 이미 댓글을 달았는지 체크 (현재 작성 중인 댓글 제외)
    const existingComments = await getCommentsByUserAndPhoto(userId, photoId, commentId);
    if (existingComments.length > 0) {
      return {
        points: 0,
        totalPoints: 0,
        isLimitReached: false,
        reason: '같은 게시글에는 한 번만 포인트가 적립됩니다.',
      };
    }
    
    // 포인트 설정 조회
    const settings = await getPointSettings();
    const POINTS_PER_COMMENT = settings.pointsPerComment;
    const DAILY_POINT_LIMIT = settings.dailyLimit;
    
    // 오늘 적립된 포인트 확인
    const todayPoints = await getTodayPoints(userId);
    
    // 하루 적립 상한 체크
    if (todayPoints >= DAILY_POINT_LIMIT) {
      return {
        points: 0,
        totalPoints: 0,
        isLimitReached: true,
      };
    }
    
    // 적립 가능한 포인트 계산
    const availablePoints = DAILY_POINT_LIMIT - todayPoints;
    const pointsToAward = Math.min(POINTS_PER_COMMENT, availablePoints);
    
    if (pointsToAward <= 0) {
      return {
        points: 0,
        totalPoints: 0,
        isLimitReached: true,
      };
    }
    
    // 커뮤니티 포인트 적립 (트랜잭션 사용) - 게임 포인트와 별개로 관리
    let totalCommunityPoints = 0;
    await runTransaction(db, async (transaction) => {
      // 사용자 문서 조회
      const userRef = doc(db, 'users', userId);
      const userSnap = await transaction.get(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }
      
      // 커뮤니티 포인트 이력 기록
      const communityPointsHistoryRef = collection(db, `users/${userId}/communityPointsHistory`);
      const pointDocRef = doc(communityPointsHistoryRef);
      transaction.set(pointDocRef, {
        point: pointsToAward,
        source: 'community_comment',
        photoId,
        commentId,
        at: Timestamp.now(),
      });
      
      // communityPoint 업데이트 (게임 포인트와 별개)
      const currentCommunityPoints = (userSnap.data()?.communityPoint ?? 0) as number;
      const nextCommunityPoints = Math.max(0, currentCommunityPoints + pointsToAward);
      
      transaction.update(userRef, {
        communityPoint: nextCommunityPoints,
      });
      
      totalCommunityPoints = nextCommunityPoints;
    });
    
    // 오늘 적립 포인트 업데이트
    await updateTodayPoints(userId, pointsToAward);
    
    return {
      points: pointsToAward,
      totalPoints: totalCommunityPoints, // 커뮤니티 포인트 총합
      isLimitReached: todayPoints + pointsToAward >= DAILY_POINT_LIMIT,
    };
  } catch (error) {
    console.error('Error awarding comment points:', error);
    throw error;
  }
}

/**
 * 오늘 남은 적립 가능 포인트 조회
 */
export async function getRemainingPoints(userId: string): Promise<number> {
  try {
    const settings = await getPointSettings();
    const todayPoints = await getTodayPoints(userId);
    return Math.max(0, settings.dailyLimit - todayPoints);
  } catch (error) {
    console.error('Error getting remaining points:', error);
    return 0;
  }
}

/**
 * 포인트 적립 규칙 조회 (비동기)
 */
export async function getPointRules(): Promise<{ pointsPerComment: number; dailyLimit: number }> {
  return await getPointSettings();
}

/**
 * 포인트 설정 저장 (관리자 전용)
 */
export async function savePointSettings(
  pointsPerComment: number,
  dailyLimit: number
): Promise<void> {
  try {
    if (pointsPerComment < 1) {
      throw new Error('댓글당 포인트는 1 이상이어야 합니다.');
    }
    if (dailyLimit < 1) {
      throw new Error('하루 최대 포인트는 1 이상이어야 합니다.');
    }
    
    const configRef = doc(db, 'config', 'communityPoints');
    await setDoc(configRef, {
      pointsPerComment,
      dailyLimit,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    console.error('Error saving point settings:', error);
    throw error;
  }
}

/**
 * 사용자의 총 커뮤니티 포인트 조회
 */
export async function getCommunityPoints(userId: string): Promise<number> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return 0;
    }
    
    return (userSnap.data()?.communityPoint ?? 0) as number;
  } catch (error) {
    console.error('Error getting community points:', error);
    return 0;
  }
}

/**
 * 댓글 삭제 시 포인트 회수
 * @param userId 사용자 UUID
 * @param pointsToDeduct 회수할 포인트
 */
export async function deductCommentPoints(
  userId: string,
  pointsToDeduct: number
): Promise<number> {
  try {
    if (pointsToDeduct <= 0) {
      return await getCommunityPoints(userId);
    }
    
    let totalCommunityPoints = 0;
    await runTransaction(db, async (transaction) => {
      // 사용자 문서 조회
      const userRef = doc(db, 'users', userId);
      const userSnap = await transaction.get(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }
      
      // communityPoint 차감 (게임 포인트와 별개)
      const currentCommunityPoints = (userSnap.data()?.communityPoint ?? 0) as number;
      const nextCommunityPoints = Math.max(0, currentCommunityPoints - pointsToDeduct);
      
      transaction.update(userRef, {
        communityPoint: nextCommunityPoints,
      });
      
      totalCommunityPoints = nextCommunityPoints;
    });
    
    // 오늘 적립 포인트 차감
    const today = getTodayDate();
    const communityPointsRef = doc(db, `users/${userId}/communityPoints`, today);
    const docSnap = await getDoc(communityPointsRef);
    
    if (docSnap.exists()) {
      const currentData = docSnap.data();
      const newTotalPoints = Math.max(0, (currentData.totalPoints || 0) - pointsToDeduct);
      await updateDoc(communityPointsRef, {
        totalPoints: newTotalPoints,
        lastUpdated: Timestamp.now(),
      });
    }
    
    return totalCommunityPoints;
  } catch (error) {
    console.error('Error deducting comment points:', error);
    throw error;
  }
}

