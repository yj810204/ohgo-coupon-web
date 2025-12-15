import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  orderBy,
  Timestamp,
  increment,
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export interface CommunityPhoto {
  photoId: string;
  imageUrl: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: Timestamp | Date;
  title?: string;
  description?: string;
  content?: string; // HTML 콘텐츠 (에디터로 작성된 내용)
  photoDate?: Timestamp | Date; // 사진 촬영 날짜
  templateId?: string; // 사용된 템플릿 ID
  templateFieldValues?: Record<string, string | string[]>; // 템플릿 필드 값들
  commentCount: number;
}

export interface Comment {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Timestamp | Date;
  pointAwarded: number;
}

/**
 * 사진 목록 조회
 */
export async function getPhotos(limitCount?: number): Promise<CommunityPhoto[]> {
  try {
    const photosRef = collection(db, 'communityPhotos');
    const constraints: any[] = [orderBy('uploadedAt', 'desc')];
    
    if (limitCount) {
      constraints.push(limit(limitCount));
    }
    
    const q = query(photosRef, ...constraints);
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        photoId: doc.id,
        ...data,
        uploadedAt: data.uploadedAt?.toDate?.() || data.uploadedAt,
        photoDate: data.photoDate?.toDate?.() || data.photoDate,
        templateFieldValues: data.templateFieldValues || undefined,
      } as CommunityPhoto;
    });
  } catch (error) {
    console.error('Error getting photos:', error);
    throw error;
  }
}

/**
 * 특정 사진 조회
 */
export async function getPhoto(photoId: string): Promise<CommunityPhoto | null> {
  try {
    const photoRef = doc(db, 'communityPhotos', photoId);
    const photoSnap = await getDoc(photoRef);
    
    if (!photoSnap.exists()) {
      return null;
    }
    
    const data = photoSnap.data();
    const result = {
      photoId: photoSnap.id,
      ...data,
      uploadedAt: data.uploadedAt?.toDate?.() || data.uploadedAt,
      photoDate: data.photoDate?.toDate?.() || data.photoDate,
      templateFieldValues: data.templateFieldValues || undefined,
    } as CommunityPhoto;
    console.log('getPhoto - data.templateFieldValues:', data.templateFieldValues);
    console.log('getPhoto - result.templateFieldValues:', result.templateFieldValues);
    return result;
  } catch (error) {
    console.error('Error getting photo:', error);
    throw error;
  }
}

/**
 * 사진 업로드
 */
export async function uploadPhoto(
  imageFile: File,
  uploadedBy: string,
  uploadedByName: string,
  title?: string,
  description?: string,
  content?: string,
  photoDate?: Date,
  templateId?: string,
  templateFieldValues?: Record<string, string | string[]>
): Promise<string> {
  try {
    // Firebase Storage에 이미지 업로드
    const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const imagePath = `community/photos/${photoId}.jpg`;
    const storageRef = ref(storage, imagePath);
    
    const bytes = await imageFile.arrayBuffer();
    const blob = new Blob([bytes], { type: imageFile.type });
    
    await uploadBytes(storageRef, blob);
    const imageUrl = await getDownloadURL(storageRef);
    
    // Firestore에 메타데이터 저장
    const photosRef = collection(db, 'communityPhotos');
    const photoData: any = {
      imageUrl,
      uploadedBy,
      uploadedByName,
      uploadedAt: Timestamp.now(),
      title: title || '',
      description: description || '',
      commentCount: 0,
    };
    
    if (content) {
      photoData.content = content;
    }
    
    if (photoDate) {
      photoData.photoDate = Timestamp.fromDate(photoDate);
    }
    
    if (templateId) {
      photoData.templateId = templateId;
    }
    
    if (templateFieldValues) {
      photoData.templateFieldValues = templateFieldValues;
    }
    
    const docRef = await addDoc(photosRef, photoData);
    
    return docRef.id;
  } catch (error) {
    console.error('Error uploading photo:', error);
    throw error;
  }
}

/**
 * 사진 정보 수정
 */
export async function updatePhoto(
  photoId: string,
  updates: {
    title?: string;
    description?: string;
    content?: string;
    photoDate?: Date;
    templateId?: string;
    templateFieldValues?: Record<string, string | string[]>;
    imageFile?: File;
  }
): Promise<void> {
  try {
    const photoRef = doc(db, 'communityPhotos', photoId);
    const updateData: any = {};
    
    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }
    
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    
    if (updates.content !== undefined) {
      updateData.content = updates.content;
    }
    
    if (updates.photoDate !== undefined) {
      updateData.photoDate = updates.photoDate ? Timestamp.fromDate(updates.photoDate) : null;
    }
    
    if (updates.templateId !== undefined) {
      updateData.templateId = updates.templateId;
    }
    
    if (updates.templateFieldValues !== undefined) {
      updateData.templateFieldValues = updates.templateFieldValues;
    }
    
    // 이미지 파일이 있으면 업로드
    if (updates.imageFile) {
      const imagePath = `community/photos/${photoId}.jpg`;
      const storageRef = ref(storage, imagePath);
      
      const bytes = await updates.imageFile.arrayBuffer();
      const blob = new Blob([bytes], { type: updates.imageFile.type });
      
      await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(storageRef);
      updateData.imageUrl = imageUrl;
    }
    
    updateData.updatedAt = Timestamp.now();
    
    await updateDoc(photoRef, updateData);
  } catch (error) {
    console.error('Error updating photo:', error);
    throw error;
  }
}

/**
 * 댓글 작성
 */
export async function addComment(
  photoId: string,
  userId: string,
  userName: string,
  content: string,
  pointAwarded: number
): Promise<string> {
  try {
    const commentsRef = collection(db, 'communityPhotos', photoId, 'comments');
    const commentData = {
      userId,
      userName,
      content,
      createdAt: Timestamp.now(),
      pointAwarded,
    };
    
    const docRef = await addDoc(commentsRef, commentData);
    
    // 댓글 수 증가
    const photoRef = doc(db, 'communityPhotos', photoId);
    await updateDoc(photoRef, {
      commentCount: increment(1),
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
}

/**
 * 댓글의 포인트 정보 업데이트
 */
export async function updateCommentPoints(
  photoId: string,
  commentId: string,
  pointAwarded: number
): Promise<void> {
  try {
    const commentRef = doc(db, 'communityPhotos', photoId, 'comments', commentId);
    await updateDoc(commentRef, {
      pointAwarded,
    });
  } catch (error) {
    console.error('Error updating comment points:', error);
    throw error;
  }
}

/**
 * 댓글 목록 조회
 */
export async function getComments(photoId: string): Promise<Comment[]> {
  try {
    const commentsRef = collection(db, 'communityPhotos', photoId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      commentId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
    })) as Comment[];
  } catch (error) {
    console.error('Error getting comments:', error);
    throw error;
  }
}

/**
 * 댓글 삭제
 */
export async function deleteComment(
  photoId: string,
  commentId: string
): Promise<{ userId: string; pointAwarded: number } | null> {
  try {
    // 댓글 정보 조회
    const commentRef = doc(db, 'communityPhotos', photoId, 'comments', commentId);
    const commentSnap = await getDoc(commentRef);
    
    if (!commentSnap.exists()) {
      throw new Error('댓글을 찾을 수 없습니다.');
    }
    
    const commentData = commentSnap.data();
    const userId = commentData.userId;
    const pointAwarded = commentData.pointAwarded || 0;
    
    // 댓글 삭제
    await deleteDoc(commentRef);
    
    // 댓글 수 감소
    const photoRef = doc(db, 'communityPhotos', photoId);
    await updateDoc(photoRef, {
      commentCount: increment(-1),
    });
    
    // 포인트가 적립된 댓글이면 정보 반환 (포인트 회수용)
    if (pointAwarded > 0) {
      return { userId, pointAwarded };
    }
    
    return null;
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
}

/**
 * 사진 삭제 (관리자 전용)
 */
export async function deletePhoto(photoId: string): Promise<void> {
  try {
    // 댓글 삭제
    const commentsRef = collection(db, 'communityPhotos', photoId, 'comments');
    const commentsSnapshot = await getDocs(commentsRef);
    
    for (const commentDoc of commentsSnapshot.docs) {
      await deleteDoc(commentDoc.ref);
    }
    
    // 사진 문서 삭제
    const photoRef = doc(db, 'communityPhotos', photoId);
    await deleteDoc(photoRef);
    
    // Storage에서 이미지 삭제 (선택사항)
    // const imageRef = ref(storage, `community/photos/${photoId}.jpg`);
    // await deleteObject(imageRef);
  } catch (error) {
    console.error('Error deleting photo:', error);
    throw error;
  }
}

