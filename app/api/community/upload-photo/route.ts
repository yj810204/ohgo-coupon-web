import { NextRequest, NextResponse } from 'next/server';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, message: '파일이 필요합니다.' },
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
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const imagePath = `community/photos/${photoId}.${fileExtension}`;
    
    // Firebase Storage에 업로드
    const storageRef = ref(storage, imagePath);
    const bytes = await file.arrayBuffer();
    const blob = new Blob([bytes], { type: file.type });
    
    await uploadBytes(storageRef, blob);
    
    // 다운로드 URL 가져오기
    const downloadURL = await getDownloadURL(storageRef);

    return NextResponse.json({
      success: true,
      message: '사진이 업로드되었습니다.',
      imageUrl: downloadURL,
      photoId,
      imagePath,
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || '사진 업로드 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

