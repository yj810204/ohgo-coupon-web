'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/hooks/useAppRouter';
import { resolveAppUser } from '@/lib/auth-session';
import type { PointMallProduct } from '@/constants/point-mall';
import { formatPointPrice, getProductPrimaryImageUrl } from '@/constants/point-mall';
import {
  getAllPointMallProducts,
  updatePointMallProduct,
  deletePointMallProduct,
} from '@/utils/point-mall-service';
import {
  IoAddOutline,
  IoTrashOutline,
  IoStorefrontOutline,
  IoImageOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { ADMIN_EDIT_ICON } from '@/lib/admin-icons';
import {
  OHGO_CARD,
  OHGO_CONFIRM_BTN_CLASS,
  OHGO_FONT,
  OHGO_INPUT,
  OHGO_LIST_DIVIDER,
  OHGO_PRIMARY_BTN,
} from '@/lib/page-styles';
import { ohgoConfirm } from '@/lib/ohgo-dialog';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };

export default function AdminPointMallPage() {
  const router = useRouter();
  const [products, setProducts] = useState<PointMallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAdmin = async () => {
      const appUser = await resolveAppUser();
      if (!appUser) {
        router.replace('/login');
        return;
      }
      if (!appUser.isAdmin) {
        router.replace('/main');
        return;
      }
      await loadProducts();
    };
    void checkAdmin();
  }, [router]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getAllPointMallProducts();
      setProducts(data);
      const edits: Record<string, string> = {};
      data.forEach(p => {
        edits[p.id] = String(p.stock);
      });
      setStockEdits(edits);
    } finally {
      setLoading(false);
    }
  };

  useNativePullToRefresh(loadProducts);

  const handleDelete = async (id: string, name: string) => {
    if (!(await ohgoConfirm(`"${name}" 상품을 삭제하시겠습니까?`))) return;
    try {
      await deletePointMallProduct(id);
      await loadProducts();
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleStockSave = async (id: string) => {
    const raw = stockEdits[id];
    const stock = raw === '' ? -1 : Number(raw);
    if (Number.isNaN(stock)) {
      alert('재고는 숫자로 입력해 주세요. (-1: 무제한)');
      return;
    }
    try {
      await updatePointMallProduct(id, { stock });
      await loadProducts();
    } catch (e) {
      console.error(e);
      alert('재고 저장에 실패했습니다.');
    }
  };

  const stockLabel = (stock: number) => {
    if (stock < 0) return '무제한';
    if (stock === 0) return '품절';
    return `${stock}개`;
  };

  return (
    <SubPageFrame title="포인트몰 관리" onRefresh={loadProducts}>
      <button
        type="button"
        onClick={() => router.push('/admin-point-mall/form')}
        className={`btn w-100 d-flex align-items-center justify-content-center gap-2 fw-bold mb-4 ${OHGO_CONFIRM_BTN_CLASS}`}
        style={OHGO_PRIMARY_BTN}
      >
        <IoAddOutline size={20} />
        새 상품 등록
      </button>

      {loading ? (
        <div className="py-5 text-center">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={IoStorefrontOutline} message="등록된 상품이 없습니다." style={CARD} />
      ) : (
        <>
          <p
            className="mb-2"
            style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, lineHeight: 1.4 }}
          >
            재고는 행에서 바로 수정할 수 있습니다. <span style={{ color: '#ABABAB' }}>-1 = 무제한</span>
          </p>
          <div
            style={{
              borderRadius: 14,
              border: '1px solid #EFEFEF',
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {products.map((product, index) => {
              const outOfStock = product.stock === 0;
              const thumbUrl = getProductPrimaryImageUrl(product);
              const stockDirty =
                (stockEdits[product.id] ?? String(product.stock)) !== String(product.stock);

              return (
                <div key={product.id}>
                  {index > 0 && <div style={OHGO_LIST_DIVIDER} />}
                  <div
                    className="ohgo-data-list-row"
                    style={{
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 10,
                      opacity: product.isActive ? 1 : 0.75,
                      backgroundColor: product.isActive ? '#FFFFFF' : '#FAFAFA',
                    }}
                  >
                    <div className="d-flex align-items-center gap-3 w-100">
                      <div className="ohgo-data-list-row__thumb">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                          />
                        ) : (
                          <IoImageOutline size={24} color="#B0B8C4" />
                        )}
                      </div>

                      <div className="flex-grow-1 min-w-0">
                        <div className="d-flex align-items-center gap-2 min-w-0">
                          <span
                            className="ohgo-data-list-row__title text-truncate"
                            style={{ fontFamily: FONT }}
                          >
                            {product.name}
                          </span>
                          <span
                            className="badge rounded-pill flex-shrink-0"
                            style={{
                              backgroundColor: product.isActive ? '#EBF1FE' : '#F7F8FA',
                              color: product.isActive ? '#1B6FF5' : '#6F767E',
                              fontSize: 10,
                              fontFamily: FONT,
                              fontWeight: 700,
                            }}
                          >
                            {product.isActive ? '노출' : '숨김'}
                          </span>
                          {outOfStock && (
                            <span
                              className="badge rounded-pill flex-shrink-0"
                              style={{
                                backgroundColor: '#FFF0F0',
                                color: '#FF3B30',
                                fontSize: 10,
                                fontFamily: FONT,
                                fontWeight: 700,
                              }}
                            >
                              품절
                            </span>
                          )}
                        </div>
                        <div
                          className="ohgo-data-list-row__meta text-truncate"
                          style={{ fontFamily: FONT, marginTop: 4 }}
                        >
                          <span style={{ color: '#1B6FF5', fontWeight: 700 }}>
                            {formatPointPrice(product.pointPrice)}
                          </span>
                          <span aria-hidden> · </span>
                          재고 {stockLabel(product.stock)}
                          <span aria-hidden> · </span>
                          정렬 {product.order}
                        </div>
                      </div>

                      <div className="d-flex gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => router.push(`/admin-point-mall/form?id=${product.id}`)}
                          className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                          title="수정"
                          style={{ width: 32, height: 32, backgroundColor: '#EBF1FE', border: 'none' }}
                        >
                          <ADMIN_EDIT_ICON size={16} color="#1B6FF5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(product.id, product.name)}
                          className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                          title="삭제"
                          style={{ width: 32, height: 32, backgroundColor: '#FFF0F0', border: 'none' }}
                        >
                          <IoTrashOutline size={16} color="#FF3B30" />
                        </button>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2 w-100">
                      <span
                        className="flex-shrink-0"
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#6F767E',
                          fontFamily: FONT,
                          minWidth: 28,
                        }}
                      >
                        재고
                      </span>
                      <input
                        type="number"
                        value={stockEdits[product.id] ?? String(product.stock)}
                        onChange={e =>
                          setStockEdits(prev => ({ ...prev, [product.id]: e.target.value }))
                        }
                        placeholder="-1"
                        className="form-control form-control-sm"
                        style={{
                          ...OHGO_INPUT,
                          padding: '8px 10px',
                          fontSize: 14,
                          backgroundColor: '#F7F8FA',
                          margin: 0,
                          minWidth: 0,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void handleStockSave(product.id)}
                        disabled={!stockDirty}
                        className="btn flex-shrink-0"
                        style={{
                          backgroundColor: stockDirty ? '#1B6FF5' : '#E8EEF7',
                          color: stockDirty ? '#FFFFFF' : '#8A94A6',
                          border: 'none',
                          borderRadius: 10,
                          fontFamily: FONT,
                          fontWeight: 700,
                          fontSize: 13,
                          lineHeight: 1.2,
                          padding: '8px 14px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </SubPageFrame>
  );
}
