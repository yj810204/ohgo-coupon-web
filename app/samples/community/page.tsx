'use client';

import { useRouter } from '@/hooks/useAppRouter';
import { IoAddOutline, IoChatbubblesOutline, IoImageOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { SAMPLE_PHOTOS } from '@/lib/samples/mock-data';

const FONT = "var(--font-ohgo), sans-serif";

export default function SampleCommunityPage() {
  const router = useRouter();

  return (
    <SubPageFrame
      title="조황 사진"
      showMyPage={false}
      onBack={() => router.push('/samples/main')}
    >
      <div className="d-flex align-items-center justify-content-between mb-3">
        <span style={{ fontSize: 14, color: '#6F767E', fontFamily: FONT }}>
          총 {SAMPLE_PHOTOS.length}개
        </span>
        <button
          type="button"
          className="btn d-flex align-items-center gap-1"
          style={{
            backgroundColor: '#1B6FF5',
            borderRadius: 10,
            border: 'none',
            padding: '7px 14px',
            fontSize: 13,
            color: '#fff',
            fontFamily: FONT,
            fontWeight: 600,
          }}
        >
          <IoAddOutline size={15} />
          등록하기
        </button>
      </div>

      <div className="row g-2">
        {SAMPLE_PHOTOS.map((photo) => (
          <div key={photo.id} className="col-6">
            <div
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: '#F0F2F5',
                position: 'relative',
                aspectRatio: '1 / 1',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                className="d-flex flex-column align-items-center justify-content-center flex-grow-1"
                style={{ color: '#9CA3AF', gap: 6 }}
              >
                <IoImageOutline size={28} />
                <span style={{ fontSize: 12, fontFamily: FONT, fontWeight: 600 }}>이미지 없음</span>
              </div>
              <div
                style={{
                  padding: '10px',
                  background: 'rgba(26,29,31,0.78)',
                  color: '#fff',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: FONT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {photo.title}
                </div>
                <div
                  className="d-flex align-items-center gap-2 mt-1"
                  style={{ fontSize: 11, opacity: 0.9, fontFamily: FONT }}
                >
                  <span>{photo.dateLabel}</span>
                  <span className="d-inline-flex align-items-center gap-1">
                    <IoChatbubblesOutline size={12} />
                    {photo.commentCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SubPageFrame>
  );
}
