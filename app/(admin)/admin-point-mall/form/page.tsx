'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PointMallProductInput } from '@/constants/point-mall';
import { getProductImageUrls } from '@/constants/point-mall';
import {
  getAllPointMallProducts,
  addPointMallProduct,
  updatePointMallProduct,
  uploadProductImage,
} from '@/utils/point-mall-service';
import { IoImageOutline, IoTrashOutline } from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import { FormActions, FormSection, FORM_LABEL } from '@/components/SubPageForm';
import { useRequireAdmin } from '@/hooks/useRequireAdmin';
import { OHGO_FONT, OHGO_INPUT, OhgoPageLoading } from '@/lib/page-styles';

const MAX_PRODUCT_IMAGES = 10;

const EMPTY: PointMallProductInput = {
  name: '',
  description: '',
  pointPrice: 0,
  imageUrls: [],
  stock: -1,
  isActive: true,
  order: 0,
};

function ProductImagePreviewGrid({
  urls,
  disabled,
  onRemove,
}: {
  urls: string[];
  disabled?: boolean;
  onRemove: (index: number) => void;
}) {
  if (urls.length === 0) return null;
  return (
    <div
      className="mb-3"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}
    >
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className="position-relative">
          <div
            className="w-100 overflow-hidden d-flex align-items-center justify-content-center"
            style={{
              aspectRatio: '1',
              borderRadius: 12,
              border: '1px solid #EFEFEF',
              backgroundColor: '#F7F8FA',
            }}
          >
            <img
              src={url}
              alt={`상품 이미지 ${index + 1}`}
              className="w-100 h-100"
              style={{ objectFit: 'contain', display: 'block' }}
            />
          </div>
          <button
            type="button"
            className="btn p-0 position-absolute d-flex align-items-center justify-content-center rounded-circle"
            style={{
              top: 6,
              right: 6,
              width: 28,
              height: 28,
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
              zIndex: 10,
            }}
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label="이미지 삭제"
          >
            <IoTrashOutline size={14} color="#FF3B30" />
          </button>
        </div>
      ))}
    </div>
  );
}

function PointMallFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const { ready } = useRequireAdmin();
  const [form, setForm] = useState<PointMallProductInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(!!editId);

  const imageUrls = form.imageUrls ?? [];

  useEffect(() => {
    if (!ready || !editId) return;
    const load = async () => {
      setLoadingProduct(true);
      try {
        const products = await getAllPointMallProducts();
        const p = products.find(x => x.id === editId);
        if (!p) {
          alert('상품을 찾을 수 없습니다.');
          router.replace('/admin-point-mall');
          return;
        }
        setForm({
          name: p.name,
          description: p.description,
          pointPrice: p.pointPrice,
          imageUrls: getProductImageUrls(p),
          stock: p.stock,
          isActive: p.isActive,
          order: p.order,
        });
      } finally {
        setLoadingProduct(false);
      }
    };
    void load();
  }, [ready, editId, router]);

  useEffect(() => {
    if (!ready || editId) return;
    const loadOrder = async () => {
      const products = await getAllPointMallProducts();
      setForm(f => ({ ...f, order: products.length + 1 }));
    };
    void loadOrder();
  }, [ready, editId]);

  const setField = <K extends keyof PointMallProductInput>(key: K, value: PointMallProductInput[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const remaining = MAX_PRODUCT_IMAGES - imageUrls.length;
    if (remaining <= 0) {
      alert(`이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 등록할 수 있습니다.`);
      e.target.value = '';
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      alert(`이미지는 최대 ${MAX_PRODUCT_IMAGES}장까지 등록할 수 있습니다. ${remaining}장만 추가됩니다.`);
    }

    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of toUpload) {
        const url = await uploadProductImage(file);
        newUrls.push(url);
      }
      setField('imageUrls', [...imageUrls, ...newUrls]);
    } catch (err) {
      console.error(err);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    setField(
      'imageUrls',
      imageUrls.filter((_, i) => i !== index)
    );
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('상품명을 입력해 주세요.');
      return;
    }
    if (!form.pointPrice || form.pointPrice < 1) {
      alert('구매 포인트는 1 이상이어야 합니다.');
      return;
    }
    setSaving(true);
    try {
      const payload: PointMallProductInput = {
        name: form.name.trim(),
        description: form.description.trim(),
        pointPrice: Number(form.pointPrice),
        stock: form.stock === undefined || form.stock === null ? -1 : Number(form.stock),
        order: Number(form.order) || 0,
        isActive: form.isActive,
        imageUrls: imageUrls,
      };
      if (editId) {
        await updatePointMallProduct(editId, payload);
      } else {
        await addPointMallProduct(payload);
      }
      router.replace('/admin-point-mall');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loadingProduct) {
    return <OhgoPageLoading />;
  }

  const atImageLimit = imageUrls.length >= MAX_PRODUCT_IMAGES;

  return (
    <SubPageFrame title={editId ? '상품 수정' : '새 상품 등록'}>
      <FormSection title="기본 정보">
        <div className="mb-3">
          <label style={FORM_LABEL}>상품명 *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            className="form-control"
            style={OHGO_INPUT}
            placeholder="상품명을 입력하세요"
          />
        </div>
        <div className="mb-3">
          <label style={FORM_LABEL}>구매 포인트 *</label>
          <input
            type="number"
            min={1}
            value={form.pointPrice || ''}
            onChange={e => setField('pointPrice', e.target.value === '' ? 0 : Number(e.target.value))}
            className="form-control"
            style={OHGO_INPUT}
            placeholder="1"
          />
        </div>
        <div className="mb-0">
          <label style={FORM_LABEL}>상품 설명</label>
          <textarea
            value={form.description}
            onChange={e => setField('description', e.target.value)}
            rows={3}
            className="form-control"
            style={{ ...OHGO_INPUT, resize: 'none' }}
            placeholder="상품 설명 (선택)"
          />
        </div>
      </FormSection>

      <FormSection title="상품 이미지">
        <ProductImagePreviewGrid urls={imageUrls} disabled={uploading} onRemove={handleRemoveImage} />
        <label
          className="btn w-100 d-flex align-items-center justify-content-center gap-2 mb-0"
          style={{
            backgroundColor: '#F7F8FA',
            color: atImageLimit ? '#9A9FA5' : '#1A1D1F',
            borderRadius: 10,
            padding: 12,
            border: '2px dashed #D0D5DD',
            fontFamily: OHGO_FONT,
            fontSize: 14,
            fontWeight: 600,
            opacity: uploading || atImageLimit ? 0.6 : 1,
            pointerEvents: uploading || atImageLimit ? 'none' : undefined,
          }}
        >
          <IoImageOutline size={18} aria-hidden />
          {uploading
            ? '업로드 중...'
            : imageUrls.length > 0
              ? `이미지 추가 (${imageUrls.length}/${MAX_PRODUCT_IMAGES})`
              : '이미지 선택'}
          <input
            type="file"
            accept="image/*"
            multiple
            className="d-none"
            onChange={e => void handleImageChange(e)}
            disabled={uploading || atImageLimit}
          />
        </label>
        {imageUrls.length > 0 && (
          <small style={{ fontSize: 11, color: '#9A9FA5', fontFamily: OHGO_FONT, marginTop: 8, display: 'block' }}>
            첫 번째 이미지가 목록 대표 이미지로 사용됩니다.
          </small>
        )}
      </FormSection>

      <FormSection title="판매 설정">
        <div className="row g-2 mb-3">
          <div className="col-6">
            <label style={FORM_LABEL}>재고</label>
            <input
              type="number"
              value={form.stock}
              onChange={e => setField('stock', e.target.value === '' ? -1 : Number(e.target.value))}
              className="form-control"
              style={OHGO_INPUT}
            />
            <small style={{ fontSize: 11, color: '#9A9FA5', fontFamily: OHGO_FONT, marginTop: 4, display: 'block' }}>
              -1 = 무제한
            </small>
          </div>
          <div className="col-6">
            <label style={FORM_LABEL}>정렬 순서</label>
            <input
              type="number"
              value={form.order}
              onChange={e => setField('order', Number(e.target.value) || 0)}
              className="form-control"
              style={OHGO_INPUT}
            />
          </div>
        </div>
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2"
          style={{ backgroundColor: '#F7F8FA', borderRadius: 10, border: '1px solid #EFEFEF' }}
        >
          <span style={{ fontFamily: OHGO_FONT, fontSize: 14, fontWeight: 600, color: '#1A1D1F' }}>노출 여부</span>
          <div className="form-check form-switch m-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={e => setField('isActive', e.target.checked)}
            />
          </div>
        </div>
      </FormSection>

      <FormActions
        onCancel={() => router.back()}
        onSubmit={() => void handleSave()}
        submitLabel={editId ? '수정' : '저장'}
        loading={saving}
        loadingLabel="저장 중..."
        disabled={uploading}
      />
    </SubPageFrame>
  );
}

export default function AdminPointMallFormPage() {
  return (
    <Suspense fallback={<OhgoPageLoading />}>
      <PointMallFormContent />
    </Suspense>
  );
}
