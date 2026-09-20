'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/hooks/useAppRouter';
import { IoImageOutline, IoTrashOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { resolveAppUser } from '@/lib/auth-session';
import { ohgoAlert } from '@/lib/ohgo-dialog';
import { useImageEditQueue } from '@/hooks/useImageEditQueue';
import {
  createListing,
  getListing,
  MARKET_GRADES,
  MARKET_TRADE_METHODS,
  decodeTradeInfo,
  encodeTradeInfo,
  updateMyListing,
  type MarketCategory,
  type MarketConditionGrade,
  type MarketTradeMethod,
} from '@/utils/market-service';
import {
  activeOrFallback,
  getBoardCategories,
  type BoardCategory,
} from '@/utils/board-category-service';
import CategoryChipRow from '@/components/community/CategoryChipRow';
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

function MarketSellContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const isEdit = Boolean(editId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ uuid: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MarketCategory>('etc');
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [price, setPrice] = useState('');
  const [conditionGrade, setConditionGrade] = useState<MarketConditionGrade>('mid');
  const [contactPhone, setContactPhone] = useState('');
  const [tradeMethod, setTradeMethod] = useState<MarketTradeMethod>('meetup');
  const [meetupArea, setMeetupArea] = useState('');
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
      setUser({ uuid: appUser.uuid, name: appUser.name });
      const cats = await getBoardCategories('market', { includeInactive: true });
      setCategories(cats);

      if (editId) {
        try {
          const listing = await getListing(editId);
          if (!listing) {
            alert('판매글을 찾을 수 없습니다.');
            router.replace('/market/my');
            return;
          }
          if (listing.sellerId !== appUser.uuid && !appUser.isAdmin) {
            alert('수정 권한이 없습니다.');
            router.replace(`/market/${editId}`);
            return;
          }
          if (listing.status === 'sold' || listing.status === 'hidden') {
            alert('수정할 수 없는 상태입니다.');
            router.replace('/market/my');
            return;
          }
          setTitle(listing.title);
          setDescription(listing.description);
          setCategory(activeOrFallback(cats, listing.category));
          setPrice(listing.price > 0 ? String(listing.price) : '');
          setConditionGrade(listing.conditionGrade ?? 'mid');
          setContactPhone(listing.contactPhone ?? '');
          const trade = decodeTradeInfo(listing.tradeArea);
          setTradeMethod(trade.method);
          setMeetupArea(trade.area);
          setExistingUrls(listing.imageUrls);
        } catch (error) {
          console.error(error);
          alert('판매글을 불러오지 못했습니다.');
          router.replace('/market/my');
          return;
        }
      } else {
        setCategory(activeOrFallback(cats));
      }

      setLoading(false);
    };
    void init();
  }, [router, editId]);

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
    if (!title.trim()) {
      alert('상품명을 입력해주세요.');
      return;
    }
    if (previewItems.length === 0) {
      alert('이미지를 1장 이상 등록해주세요.');
      return;
    }
    if (!contactPhone.trim()) {
      alert('연락처를 입력해주세요.');
      return;
    }
    if (tradeMethod === 'meetup' && !meetupArea.trim()) {
      alert('직거래 지역을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const input = {
        title: title.trim(),
        description: description.trim(),
        category,
        price: Number(price.replace(/[^\d]/g, '')) || 0,
        conditionGrade,
        imageUrls: existingUrls,
        contactPhone: contactPhone.trim(),
        tradeArea: encodeTradeInfo(tradeMethod, meetupArea),
      };
      if (isEdit && editId) {
        await updateMyListing(editId, input, files, user.uuid);
        await ohgoAlert('수정되었습니다. 관리자 확인 후 게시됩니다.');
      } else {
        await createListing(user.uuid, user.name, input, files);
        await ohgoAlert('등록되었습니다. 관리자 확인 후 게시됩니다.');
      }
      router.replace('/market/my');
    } catch (error) {
      console.error(error);
      await ohgoAlert(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <OhgoPageLoading />;

  return (
    <SubPageFrame
      title={isEdit ? '판매글 수정' : '판매 등록'}
      onBack={() => router.replace(isEdit ? '/market/my' : '/market')}
    >
      <p style={{ fontSize: 13, color: '#6F767E', fontFamily: FONT, marginBottom: 16 }}>
        관리자가 물건 상태를 확인한 뒤 게시됩니다. 허위 매물은 반려됩니다.
      </p>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 10 }}>
          상품 사진 *
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={saving || editQueue.isEditing}
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
                      boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                    }}
                    onClick={() => handleRemove(index)}
                    disabled={saving}
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
              disabled={saving || editQueue.isEditing}
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
            disabled={saving || editQueue.isEditing}
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
              이미지를 선택해주세요
            </span>
          </button>
        )}
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          상품명 *
        </label>
        <input
          className="form-control"
          style={OHGO_INPUT}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 다이와 스피닝릴"
          disabled={saving}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          설명
        </label>
        <textarea
          className="form-control"
          style={{ ...OHGO_INPUT, minHeight: 100 }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="사용 기간, 하자 여부 등을 적어주세요."
          disabled={saving}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          카테고리
        </label>
        <CategoryChipRow
          categories={categories.filter((item) => item.isActive || item.id === category)}
          value={category}
          onChange={(value) => {
            if (value !== 'all') setCategory(value);
          }}
          showAll={false}
          disabled={saving}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          가격 (원, 0이면 나눔/가격제안)
        </label>
        <input
          className="form-control"
          style={OHGO_INPUT}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="0"
          disabled={saving}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          상태
        </label>
        <div className="d-flex gap-2">
          {MARKET_GRADES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setConditionGrade(item.id)}
              className="btn flex-grow-1"
              style={{
                borderRadius: 10,
                border: 'none',
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT,
                backgroundColor: conditionGrade === item.id ? '#EBF1FE' : '#F2F3F5',
                color: conditionGrade === item.id ? '#1B6FF5' : '#6F767E',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          연락처 *
        </label>
        <input
          className="form-control"
          style={OHGO_INPUT}
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="010-0000-0000"
          disabled={saving}
        />
      </div>

      <div style={{ ...OHGO_CARD, padding: '14px 16px', marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#1A1D1F', fontFamily: FONT, display: 'block', marginBottom: 8 }}>
          거래 방식 *
        </label>
        <CategoryChipRow
          categories={MARKET_TRADE_METHODS}
          value={tradeMethod}
          onChange={(value) => {
            if (value === 'meetup' || value === 'delivery' || value === 'ohgo_keep') {
              setTradeMethod(value);
            }
          }}
          showAll={false}
          disabled={saving}
        />
        {tradeMethod === 'meetup' ? (
          <input
            className="form-control mt-3"
            style={OHGO_INPUT}
            value={meetupArea}
            onChange={(e) => setMeetupArea(e.target.value)}
            placeholder="직거래 지역"
            disabled={saving}
          />
        ) : null}
      </div>

      <p style={{ fontSize: 12, color: '#8A9199', fontFamily: FONT, marginBottom: 16, lineHeight: 1.5 }}>
        등록하면 관리자 승인 후 게시됩니다.
      </p>

      <button
        type="button"
        className={`btn w-100 fw-semibold ${OHGO_CONFIRM_BTN_CLASS}`}
        style={OHGO_CONFIRM_BTN}
        disabled={
          saving ||
          previewItems.length === 0 ||
          !title.trim() ||
          !contactPhone.trim() ||
          (tradeMethod === 'meetup' && !meetupArea.trim()) ||
          editQueue.isEditing
        }
        onClick={() => void handleSubmit()}
      >
        {saving ? '저장 중...' : isEdit ? '수정 후 재심사 요청' : '등록하기'}
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

export default function MarketSellPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <MarketSellContent />
    </Suspense>
  );
}
