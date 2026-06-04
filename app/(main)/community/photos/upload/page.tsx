'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IoImageOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { resolveAppUser } from '@/lib/auth-session';
import { uploadPhoto } from '@/utils/community-service';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT, OHGO_PRIMARY_BTN } from '@/lib/page-styles';

const FONT = OHGO_FONT;
const MAX_SIZE = 5 * 1024 * 1024;

export default function CommunityPhotoUploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ uuid: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      setUser({ uuid: appUser.uuid, name: appUser.name });
      setLoading(false);
    };
    void init();
  }, [router]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const valid = selected.filter((file) => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name}: 이미지 파일만 업로드할 수 있습니다.`);
        return false;
      }
      if (file.size > MAX_SIZE) {
        alert(`${file.name}: 5MB 이하만 업로드할 수 있습니다.`);
        return false;
      }
      return true;
    });
    if (valid.length > 0) setFiles(valid);
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!user || files.length === 0) {
      alert('이미지를 선택해주세요.');
      return;
    }

    setUploading(true);
    try {
      await uploadPhoto(
        files.length === 1 ? files[0] : files,
        user.uuid,
        user.name,
        title.trim() || undefined,
        description.trim() || undefined
      );
      alert('사진이 등록되었습니다.');
      router.replace('/community/photos');
    } catch (error) {
      console.error('upload error:', error);
      const message = error instanceof Error ? error.message : '업로드 중 오류가 발생했습니다.';
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-vh-100 d-flex align-items-center justify-content-center"
        style={{ backgroundColor: '#F7F8FA' }}
      >
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title="조황 사진 등록" onBack={() => router.push('/community/photos')}>
      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label htmlFor="photo-files" style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 10 }}>
          사진 *
        </label>
        <input
          id="photo-files"
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={handleFileChange}
          className="form-control"
        />
        <p style={{ fontSize: 11, color: '#ABABAB', fontFamily: FONT, marginTop: 8, marginBottom: 0 }}>
          JPG/PNG 등 이미지, 파일당 5MB 이하
        </p>
        {previewUrls.length > 0 && (
          <div className="row g-2 mt-3">
            {previewUrls.map((url, index) => (
              <div key={url} className="col-4">
                <img
                  src={url}
                  alt={`미리보기 ${index + 1}`}
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10 }}
                />
              </div>
            ))}
          </div>
        )}
        {previewUrls.length === 0 && (
          <div
            className="d-flex flex-column align-items-center justify-content-center mt-3"
            style={{ padding: '32px 16px', backgroundColor: '#F7F8FA', borderRadius: 12 }}
          >
            <IoImageOutline size={32} color="#ABABAB" />
            <span style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginTop: 8 }}>
              이미지를 선택해주세요
            </span>
          </div>
        )}
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label htmlFor="photo-title" style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          제목
        </label>
        <input
          id="photo-title"
          type="text"
          className="form-control"
          style={OHGO_INPUT}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목 (선택)"
          disabled={uploading}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 16 }}>
        <label htmlFor="photo-desc" style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          설명
        </label>
        <textarea
          id="photo-desc"
          className="form-control"
          style={{ ...OHGO_INPUT, minHeight: 88 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          disabled={uploading}
        />
      </div>

      <button
        type="button"
        className="btn w-100 fw-semibold"
        style={OHGO_PRIMARY_BTN}
        disabled={uploading || files.length === 0}
        onClick={() => void handleUpload()}
      >
        {uploading ? '업로드 중...' : '등록하기'}
      </button>
    </SubPageFrame>
  );
}
