'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
  deleteCaptainPhoto,
  getCaptainPhotos,
  tagPassengersAndNotify,
  uploadCaptainPhoto,
  type CaptainPhoto,
} from '@/utils/captain-photo-service';
import PassengerTagModal from '@/components/PassengerTagModal';
import EmptyState from '@/components/EmptyState';
import { OHGO_CARD, OHGO_FONT, OHGO_PRIMARY_BTN } from '@/lib/page-styles';
import { IoImageOutline, IoPeopleOutline, IoTrashOutline } from 'react-icons/io5';
import type { RosterItem } from '@/utils/roster-service';
import { ohgoConfirm } from '@/lib/ohgo-dialog';
import { useImageEditQueue } from '@/hooks/useImageEditQueue';

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false });

const FONT = OHGO_FONT;
const CARD: CSSProperties = { ...OHGO_CARD };
const MAX_SOURCE_SIZE = 20 * 1024 * 1024;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

type Props = {
  captainId: string;
};

export default function CaptainPhotoPanel({ captainId }: Props) {
  const [photos, setPhotos] = useState<CaptainPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tripDate, setTripDate] = useState(todayStr);
  const [species, setSpecies] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [tagPhoto, setTagPhoto] = useState<CaptainPhoto | null>(null);
  const [tagging, setTagging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editQueue = useImageEditQueue((edited) => {
    setSelectedFiles((prev) => [...prev, ...edited]);
    setPreviewUrls((prev) => [...prev, ...edited.map((file) => URL.createObjectURL(file))]);
  });

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getCaptainPhotos({ captainId });
      setPhotos(list);
    } catch (e) {
      console.error(e);
      alert('선장 조황 사진을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [captainId]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const valid = files.filter((file) => {
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

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert('사진을 선택해 주세요.');
      return;
    }
    setUploading(true);
    try {
      await uploadCaptainPhoto({
        captainId,
        files: selectedFiles,
        tripDate,
        species: species.trim() || undefined,
      });
      setSelectedFiles([]);
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      setSpecies('');
      await loadPhotos();
      alert('사진이 업로드되었습니다. 승객 태깅을 진행해 주세요.');
    } catch (e) {
      console.error(e);
      alert('업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleTagConfirm = async (passengers: RosterItem[]) => {
    if (!tagPhoto) return;
    setTagging(true);
    try {
      await tagPassengersAndNotify(
        tagPhoto.id,
        passengers.map((p, index) => ({
          userId: p.id,
          userName: p.name,
          seatNo: index + 1,
        }))
      );
      setTagPhoto(null);
      await loadPhotos();
      alert(`${passengers.length}명에게 태깅 및 알림을 발송했습니다.`);
    } catch (e) {
      console.error(e);
      alert('태깅에 실패했습니다.');
    } finally {
      setTagging(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!(await ohgoConfirm('이 조황 사진을 삭제하시겠습니까?'))) return;
    setDeletingId(photoId);
    try {
      await deleteCaptainPhoto(photoId);
      await loadPhotos();
    } catch (e) {
      console.error(e);
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div style={{ ...CARD, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, marginBottom: 12 }}>
          선장 조황 사진 업로드
        </div>

        <div className="row g-2 mb-3">
          <div className="col-6">
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>
              출조일
            </label>
            <input
              type="date"
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className="form-control mt-1"
              style={{ fontFamily: FONT, borderRadius: 10 }}
            />
          </div>
          <div className="col-6">
            <label style={{ fontSize: 12, fontWeight: 700, color: '#6F767E', fontFamily: FONT }}>
              어종 (선택)
            </label>
            <input
              type="text"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder="예: 우럭, 광어"
              className="form-control mt-1"
              style={{ fontFamily: FONT, borderRadius: 10 }}
            />
          </div>
        </div>

        <label
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 mb-0"
          style={{
            backgroundColor: '#F7F8FA',
            color: '#1A1D1F',
            borderRadius: 10,
            padding: 12,
            border: '2px dashed #EFEFEF',
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 600,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <IoImageOutline size={18} />
          사진 선택 · 편집
          <input
            type="file"
            accept="image/*"
            className="d-none"
            multiple
            onChange={handleFileChange}
            disabled={uploading || editQueue.isEditing}
          />
        </label>
        <p style={{ fontSize: 11, color: '#9CA3AF', fontFamily: FONT, marginTop: 8, marginBottom: 0 }}>
          선택 후 잘라내기·편집 · 저장 시 자동 압축
        </p>

        {previewUrls.length > 0 && (
          <div
            className="mt-3"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}
          >
            {previewUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10 }}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn w-100 fw-semibold mt-3"
          style={{
            ...OHGO_PRIMARY_BTN,
            opacity: uploading || selectedFiles.length === 0 || editQueue.isEditing ? 0.6 : 1,
          }}
          disabled={uploading || selectedFiles.length === 0 || editQueue.isEditing}
          onClick={() => void handleUpload()}
        >
          {uploading ? '업로드 중...' : '업로드'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : photos.length === 0 ? (
        <EmptyState
          icon={IoImageOutline}
          message="등록된 선장 조황 사진이 없습니다"
          subtitle="사진을 업로드한 후 승객을 태깅해 주세요."
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {photos.map((photo) => (
            <div key={photo.id} style={{ ...CARD, padding: 12 }}>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FONT, color: '#1A1D1F' }}>
                    {photo.tripDate}
                    {photo.species ? ` · ${photo.species}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: FONT }}>
                    태깅 {photo.tags?.length ?? 0}명
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0"
                  onClick={() => void handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                >
                  <IoTrashOutline size={18} color="#FF3B30" />
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                {photo.imageUrls.slice(0, 3).map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    loading="lazy"
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: 8,
                    }}
                  />
                ))}
              </div>

              {photo.tags && photo.tags.length > 0 && (
                <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginBottom: 8 }}>
                  {photo.tags.map((t) => t.userName).join(', ')}
                </div>
              )}

              <button
                type="button"
                className="btn w-100 btn-outline-primary btn-sm d-flex align-items-center justify-content-center gap-2"
                style={{ fontFamily: FONT, borderRadius: 10 }}
                onClick={() => setTagPhoto(photo)}
              >
                <IoPeopleOutline size={16} />
                승객 태깅
              </button>
            </div>
          ))}
        </div>
      )}

      {tagPhoto && (
        <PassengerTagModal
          open={Boolean(tagPhoto)}
          onClose={() => setTagPhoto(null)}
          tripDate={tagPhoto.tripDate}
          initialSelectedIds={
            tagPhoto.tags
              ?.map((t) => t.userId)
              .filter((id): id is string => Boolean(id)) ?? []
          }
          onConfirm={handleTagConfirm}
          loading={tagging}
        />
      )}

      {editQueue.current ? (
        <ImageEditor
          imageUrl={editQueue.current.previewUrl}
          title={editQueue.remaining > 0 ? `이미지 편집 · 남은 ${editQueue.remaining}장` : '이미지 편집'}
          onSave={(file) => editQueue.acceptCurrent(file)}
          onCancel={editQueue.skipCurrent}
        />
      ) : null}
    </div>
  );
}
