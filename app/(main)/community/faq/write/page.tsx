'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { IoImageOutline, IoTrashOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { resolveAppUser } from '@/lib/auth-session';
import { ohgoAlert } from '@/lib/ohgo-dialog';
import { getPhoto, updatePhoto, uploadPhoto } from '@/utils/community-service';
import {
  activeOrFallback,
  getBoardCategories,
  type BoardCategory,
} from '@/utils/board-category-service';
import CategoryChipRow from '@/components/community/CategoryChipRow';
import NoticeCheckRow from '@/components/community/NoticeCheckRow';
import { useImageEditQueue } from '@/hooks/useImageEditQueue';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OhgoPageLoading,
} from '@/lib/page-styles';

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false });

const FONT = OHGO_FONT;
const MAX_SOURCE_SIZE = 20 * 1024 * 1024;

function FaqWriteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editPhotoId = searchParams.get('photoId');
  const isEdit = Boolean(editPhotoId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ uuid: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [category, setCategory] = useState('');
  const [isNotice, setIsNotice] = useState(false);
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [newPreviewUrls, setNewPreviewUrls] = useState<string[]>([]);

  const editQueue = useImageEditQueue((edited) => {
    setFiles((prev) => [...prev, ...edited]);
  });

  const previewItems = [
    ...existingUrls.map((url) => ({ kind: 'existing' as const, url })),
    ...newPreviewUrls.map((url) => ({ kind: 'new' as const, url })),
  ];

  useEffect(() => {
    const init = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (!appUser.isAdmin) {
        alert('관리자만 등록할 수 있습니다.');
        router.replace('/community/faq');
        return;
      }
      setUser({ uuid: appUser.uuid, name: appUser.name });
      const cats = await getBoardCategories('faq', { includeInactive: true });
      setCategories(cats);

      if (editPhotoId) {
        try {
          const photo = await getPhoto(editPhotoId);
          if (!photo) {
            alert('게시글을 찾을 수 없습니다.');
            router.replace('/community/faq');
            return;
          }
          setTitle(photo.title || '');
          setDescription(photo.description || '');
          setIsNotice(Boolean(photo.isNotice));
          setCategory(activeOrFallback(cats, photo.category));
          const urls =
            photo.imageUrls && photo.imageUrls.length > 0
              ? photo.imageUrls
              : photo.imageUrl
                ? [photo.imageUrl]
                : [];
          setExistingUrls(urls);
        } catch (error) {
          console.error(error);
          alert('게시글을 불러오지 못했습니다.');
          router.replace('/community/faq');
          return;
        }
      } else {
        setCategory(activeOrFallback(cats));
      }

      setLoading(false);
    };
    void init();
  }, [router, editPhotoId]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setNewPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    const valid = selected.filter((file) => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name}: 이미지 파일만 선택할 수 있습니다.`);
        return false;
      }
      if (file.size > MAX_SOURCE_SIZE) {
        alert(`${file.name}: 20MB 이하만 선택할 수 있습니다.`);
        return false;
      }
      return true;
    });
    if (valid.length > 0) editQueue.startWithFiles(valid);
  };

  const handleRemove = (index: number) => {
    if (index < existingUrls.length) {
      setExistingUrls((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setFiles((prev) => prev.filter((_, i) => i !== index - existingUrls.length));
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!category) {
      alert('카테고리를 선택해주세요.');
      return;
    }
    if (!title.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (!description.trim()) {
      alert('내용을 입력해주세요.');
      return;
    }

    setUploading(true);
    try {
      if (isEdit && editPhotoId) {
        await updatePhoto(editPhotoId, {
          title: title.trim(),
          description: description.trim(),
          category,
          isNotice,
          imageUrls: existingUrls,
          imageFile: files.length > 0 ? files : undefined,
        });
        await ohgoAlert('팁이 수정되었습니다.');
        router.replace(`/community/${editPhotoId}`);
      } else {
        await uploadPhoto(
          files.length > 0 ? files : undefined,
          user.uuid,
          user.name,
          title.trim(),
          description.trim(),
          undefined,
          undefined,
          undefined,
          undefined,
          'faq',
          category,
          isNotice
        );
        await ohgoAlert('팁이 등록되었습니다.');
        router.replace('/community/faq');
      }
    } catch (error) {
      console.error('upload error:', error);
      await ohgoAlert(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <OhgoPageLoading />;

  return (
    <SubPageFrame
      title={isEdit ? '팁 수정' : '팁 · FAQ 등록'}
      onBack={() =>
        isEdit && editPhotoId
          ? router.replace(`/community/${editPhotoId}`)
          : router.replace('/community/faq')
      }
    >
      <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginBottom: 16 }}>
        선상낚시 팁, 준비물, 자주 묻는 질문처럼 회원에게 안내할 글을 올립니다.
      </p>

      <NoticeCheckRow checked={isNotice} onChange={setIsNotice} disabled={uploading} />

      {categories.length > 0 ? (
        <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
            카테고리 *
          </label>
          <CategoryChipRow
            categories={categories.filter((item) => item.isActive || item.id === category)}
            value={category}
            onChange={(value) => {
              if (value !== 'all') setCategory(value);
            }}
            showAll={false}
            accent="#E65100"
            disabled={uploading}
          />
        </div>
      ) : null}

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          제목 *
        </label>
        <input
          className="form-control"
          style={OHGO_INPUT}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 선상낚시 초보 준비물"
          disabled={uploading}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          내용 *
        </label>
        <textarea
          className="form-control"
          style={{ ...OHGO_INPUT, minHeight: 160 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="회원에게 전달할 팁이나 FAQ를 적어주세요."
          disabled={uploading}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 10 }}>
          사진 (선택)
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={uploading || editQueue.isEditing}
          onChange={handleFileChange}
          className="visually-hidden"
        />
        {previewItems.length > 0 ? (
          <div>
            <div className="row g-2">
              {previewItems.map((item, index) => (
                <div key={`${item.kind}-${item.url}-${index}`} className="col-4 position-relative">
                  <img
                    src={item.url}
                    alt=""
                    style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10 }}
                  />
                  <button
                    type="button"
                    className="btn p-0 position-absolute d-flex align-items-center justify-content-center rounded-circle"
                    style={{
                      top: 6,
                      right: 14,
                      width: 28,
                      height: 28,
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      border: 'none',
                    }}
                    onClick={() => handleRemove(index)}
                    disabled={uploading}
                    aria-label="사진 삭제"
                  >
                    <IoTrashOutline size={14} color="#FF3B30" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || editQueue.isEditing}
              className="btn w-100 mt-3"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#1B6FF5',
                fontFamily: FONT,
                backgroundColor: '#EBF1FE',
                border: 'none',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              사진 추가
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || editQueue.isEditing}
            className="btn w-100 d-flex flex-column align-items-center justify-content-center"
            style={{
              padding: '32px 16px',
              backgroundColor: '#F7F8FA',
              borderRadius: 12,
              border: '1px dashed #D0D5DD',
            }}
          >
            <IoImageOutline size={32} color="#ABABAB" />
            <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 8 }}>
              참고 이미지를 첨부할 수 있습니다
            </span>
          </button>
        )}
      </div>

      <button
        type="button"
        className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
        style={OHGO_CONFIRM_BTN}
        disabled={uploading || !title.trim() || !description.trim() || editQueue.isEditing}
        onClick={() => void handleSubmit()}
      >
        {uploading ? '저장 중...' : isEdit ? '수정 완료' : '등록하기'}
      </button>

      {editQueue.current ? (
        <ImageEditor
          imageUrl={editQueue.current.previewUrl}
          title={editQueue.remaining > 0 ? `이미지 편집 · 남은 ${editQueue.remaining}장` : '이미지 편집'}
          onSave={(file) => editQueue.acceptCurrent(file)}
          onCancel={editQueue.skipCurrent}
        />
      ) : null}
    </SubPageFrame>
  );
}

export default function FaqWritePage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <FaqWriteContent />
    </Suspense>
  );
}
