import { NextRequest, NextResponse } from 'next/server';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const gameId = formData.get('gameId') as string;
    const assetName = formData.get('assetName') as string; // 예: 'block_0', 'bird_0', 'coin_0' 등

    if (!file || !gameId || !assetName) {
      return NextResponse.json(
        { success: false, message: '파일, 게임 ID, 에셋 이름이 필요합니다.' },
        { status: 400 }
      );
    }

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, message: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      );
    }

    // 파일 크기 확인 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: '이미지 크기는 5MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    // 파일 확장자 추출
    const fileExtension = file.name.split('.').pop() || 'png';
    const assetFileName = `${assetName}.${fileExtension}`;
    
    // Firebase Storage에 업로드
    const storageRef = ref(storage, `games/${gameId}/assets/${assetFileName}`);
    const bytes = await file.arrayBuffer();
    const blob = new Blob([bytes], { type: file.type });
    
    await uploadBytes(storageRef, blob);
    
    // 다운로드 URL 가져오기
    const downloadURL = await getDownloadURL(storageRef);

    // Firestore에 이미지 URL 저장
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    
    if (!gameSnap.exists()) {
      return NextResponse.json(
        { success: false, message: '게임을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const currentData = gameSnap.data();
    const assetUrls = currentData.asset_urls || {};
    assetUrls[assetName] = downloadURL;

    await updateDoc(gameRef, {
      asset_urls: assetUrls,
      last_update: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: '에셋이 업로드되었습니다.',
      asset_url: downloadURL,
      asset_name: assetName,
    });
  } catch (error: any) {
    console.error('Asset upload error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || '에셋 업로드 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

