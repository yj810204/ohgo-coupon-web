import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export interface Emoji {
  emojiId: string;
  name: string;
  imageUrl: string;
  order: number;
}

export interface EmojiPack {
  packId: string;
  name: string;
  description?: string;
  emojis: Emoji[];
  isActive: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/**
 * 활성화된 이모티콘 팩 목록 조회
 */
export async function getEmojiPacks(includeInactive: boolean = false): Promise<EmojiPack[]> {
  try {
    const packsRef = collection(db, 'emojiPacks');
    let q;
    
    if (!includeInactive) {
      // isActive로만 필터링하고, 클라이언트에서 정렬
      q = query(packsRef, where('isActive', '==', true));
    } else {
      // 모든 팩 조회, 클라이언트에서 정렬
      q = query(packsRef);
    }
    
    const snapshot = await getDocs(q);
    
    // 클라이언트에서 정렬 및 필터링
    let packs = snapshot.docs.map(doc => ({
      packId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
      emojis: (doc.data().emojis || []).sort((a: Emoji, b: Emoji) => (a.order || 0) - (b.order || 0)),
    })) as EmojiPack[];
    
    // createdAt으로 정렬 (최신순)
    packs.sort((a, b) => {
      const aDate = a.createdAt instanceof Date ? a.createdAt.getTime() : 
                    (a.createdAt as any)?.seconds ? (a.createdAt as any).seconds * 1000 : 0;
      const bDate = b.createdAt instanceof Date ? b.createdAt.getTime() : 
                    (b.createdAt as any)?.seconds ? (b.createdAt as any).seconds * 1000 : 0;
      return bDate - aDate; // 내림차순
    });
    
    return packs;
  } catch (error) {
    console.error('Error getting emoji packs:', error);
    throw error;
  }
}

/**
 * 특정 이모티콘 팩 조회
 */
export async function getEmojiPack(packId: string): Promise<EmojiPack | null> {
  try {
    const packRef = doc(db, 'emojiPacks', packId);
    const packSnap = await getDoc(packRef);
    
    if (!packSnap.exists()) {
      return null;
    }
    
    const data = packSnap.data();
    return {
      packId: packSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      emojis: (data.emojis || []).sort((a: Emoji, b: Emoji) => (a.order || 0) - (b.order || 0)),
    } as EmojiPack;
  } catch (error) {
    console.error('Error getting emoji pack:', error);
    throw error;
  }
}

/**
 * 이모티콘 팩 저장 (생성/수정)
 */
export async function saveEmojiPack(
  pack: Omit<EmojiPack, 'packId' | 'createdAt' | 'updatedAt'> & { packId?: string }
): Promise<string> {
  try {
    const packId = pack.packId || `pack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const packRef = doc(db, 'emojiPacks', packId);
    
    const packData: any = {
      name: pack.name,
      description: pack.description || '',
      emojis: pack.emojis || [],
      isActive: pack.isActive !== undefined ? pack.isActive : true,
      updatedAt: Timestamp.now(),
    };
    
    // 새 팩인 경우에만 createdAt 추가
    if (!pack.packId) {
      packData.createdAt = Timestamp.now();
    }
    
    await setDoc(packRef, packData, { merge: true });
    
    return packId;
  } catch (error) {
    console.error('Error saving emoji pack:', error);
    throw error;
  }
}

/**
 * 이모티콘 팩 삭제
 */
export async function deleteEmojiPack(packId: string): Promise<void> {
  try {
    // 팩의 모든 이모티콘 이미지 삭제
    const pack = await getEmojiPack(packId);
    if (pack) {
      for (const emoji of pack.emojis) {
        try {
          await deleteEmojiImage(packId, emoji.emojiId);
        } catch (error) {
          console.error(`Error deleting emoji image ${emoji.emojiId}:`, error);
        }
      }
    }
    
    // 팩 문서 삭제
    const packRef = doc(db, 'emojiPacks', packId);
    await deleteDoc(packRef);
  } catch (error) {
    console.error('Error deleting emoji pack:', error);
    throw error;
  }
}

/**
 * 이모티콘 이미지 업로드
 */
export async function uploadEmojiImage(
  packId: string,
  emojiId: string,
  imageFile: File
): Promise<string> {
  try {
    // 파일 검증
    if (!imageFile.type.startsWith('image/')) {
      throw new Error('이미지 파일만 업로드할 수 있습니다.');
    }
    
    if (imageFile.size > 100 * 1024) {
      throw new Error('이미지 크기는 100KB 이하여야 합니다.');
    }
    
    // 파일 확장자 추출
    const fileExtension = imageFile.name.split('.').pop() || 'png';
    const imagePath = `emojis/${packId}/${emojiId}.${fileExtension}`;
    
    // Firebase Storage에 업로드
    const storageRef = ref(storage, imagePath);
    const bytes = await imageFile.arrayBuffer();
    const blob = new Blob([bytes], { type: imageFile.type });
    
    await uploadBytes(storageRef, blob);
    
    // 다운로드 URL 가져오기
    const downloadURL = await getDownloadURL(storageRef);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading emoji image:', error);
    throw error;
  }
}

/**
 * 이모티콘 이미지 삭제
 */
export async function deleteEmojiImage(packId: string, emojiId: string): Promise<void> {
  try {
    // 이미지 파일 찾기 (확장자 모르므로 여러 확장자 시도)
    const extensions = ['png', 'jpg', 'jpeg', 'svg', 'webp'];
    
    for (const ext of extensions) {
      try {
        const imagePath = `emojis/${packId}/${emojiId}.${ext}`;
        const storageRef = ref(storage, imagePath);
        await deleteObject(storageRef);
        break; // 성공하면 중단
      } catch (error) {
        // 파일이 없으면 다음 확장자 시도
        continue;
      }
    }
  } catch (error) {
    console.error('Error deleting emoji image:', error);
    // 이미지 삭제 실패해도 계속 진행 (이미 삭제되었을 수 있음)
  }
}

/**
 * 댓글 텍스트에서 이모티콘 ID 추출
 */
export function extractEmojiIds(text: string): string[] {
  const emojiPattern = /:([a-zA-Z0-9_]+):/g;
  const matches = text.matchAll(emojiPattern);
  const emojiIds: string[] = [];
  
  for (const match of matches) {
    if (match[1]) {
      emojiIds.push(match[1]);
    }
  }
  
  return [...new Set(emojiIds)]; // 중복 제거
}

/**
 * 댓글 텍스트를 이모티콘 이미지로 렌더링
 */
export function renderEmojisInText(
  text: string,
  emojiMap: Record<string, string>
): string {
  return text.replace(/:([a-zA-Z0-9_]+):/g, (match, emojiId) => {
    const imageUrl = emojiMap[emojiId];
    if (imageUrl) {
      return `<img src="${imageUrl}" alt=":${emojiId}:" class="emoji-inline" style="width: 20px; height: 20px; vertical-align: middle; display: inline-block;" />`;
    }
    return match; // 이미지 URL이 없으면 원본 텍스트 유지
  });
}
