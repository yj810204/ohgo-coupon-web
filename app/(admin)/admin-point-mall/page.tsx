'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import { getUserByUUID } from '@/lib/firebase-auth';
import type { PointMallProduct } from '@/constants/point-mall';
import { formatPointPrice } from '@/constants/point-mall';
import {
  getAllPointMallProducts,
  updatePointMallProduct,
  deletePointMallProduct,
} from '@/utils/point-mall-service';
import {
  IoAddOutline,
  IoTrashOutline,
  IoPencilOutline,
  IoStorefrontOutline,
  IoImageOutline,
} from 'react-icons/io5';
import SubPageFrame from '@/components/SubPageFrame';
import EmptyState from '@/components/EmptyState';
import { useNativePullToRefresh } from '@/hooks/useNativePullToRefresh';
import { OHGO_CARD, OHGO_FONT, OHGO_INPUT, OHGO_PRIMARY_BTN } from '@/lib/page-styles';

const FONT = OHGO_FONT;
const CARD: React.CSSProperties = { ...OHGO_CARD };

export default function AdminPointMallPage() {
  const router = useRouter();
  const [products, setProducts] = useState<PointMallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      const remote = await getUserByUUID(user.uuid);
      if (!remote?.isAdmin) {
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
    if (!confirm(`"${name}" 상품을 삭제하시겠습니까?`)) return;
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
        className="btn w-100 d-flex align-items-center justify-content-center gap-2 fw-bold mb-4"
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

            return (
              <div
                key={product.id}
                className="px-3 py-3"
                style={{
                  borderBottom: index < products.length - 1 ? '1px solid #F7F8FA' : 'none',
                  opacity: product.isActive ? 1 : 0.75,
                  backgroundColor: product.isActive ? '#FFFFFF' : '#FAFAFA',
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <div
                    className="flex-shrink-0 overflow-hidden d-flex align-items-center justify-content-center"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 12,
                      background: product.imageUrl
                        ? `url(${product.imageUrl}) center/cover`
                        : '#F2F3F5',
                      border: '1px solid #EFEFEF',
                    }}
                  >
                    {!product.imageUrl && <IoImageOutline size={24} color="#B0B8C4" />}
                  </div>

                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span
                        className="badge rounded-pill flex-shrink-0"
                        style={{
                          backgroundColor: '#F7F8FA',
                          color: '#6F767E',
                          fontSize: 10,
                          fontFamily: FONT,
                          fontWeight: 700,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: '#1A1D1F',
                          fontFamily: FONT,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
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
                          fontWeight: 600,
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
                            fontWeight: 600,
                          }}
                        >
                          품절
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: '#1B6FF5',
                        fontWeight: 800,
                        fontFamily: FONT,
                        marginTop: 6,
                      }}
                    >
                      {formatPointPrice(product.pointPrice)}
                    </div>
                    <div style={{ fontSize: 12, color: '#6F767E', fontFamily: FONT, marginTop: 4 }}>
                      재고 {stockLabel(product.stock)} · 정렬 {product.order}
                    </div>
                  </div>

                  <div className="d-flex flex-row gap-1 flex-shrink-0 align-self-center">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin-point-mall/form?id=${product.id}`)}
                      className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                      title="수정"
                      style={{ width: 28, height: 28, backgroundColor: '#EBF1FE', border: 'none' }}
                    >
                      <IoPencilOutline size={14} color="#1B6FF5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(product.id, product.name)}
                      className="btn p-0 d-flex align-items-center justify-content-center rounded-circle"
                      title="삭제"
                      style={{ width: 28, height: 28, backgroundColor: '#FFF0F0', border: 'none' }}
                    >
                      <IoTrashOutline size={14} color="#FF3B30" />
                    </button>
                  </div>
                </div>

                <div
                  className="mt-3 p-2"
                  style={{ backgroundColor: '#F7F8FA', borderRadius: 10 }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#6F767E',
                      fontFamily: FONT,
                      marginBottom: 8,
                    }}
                  >
                    재고 수량
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="number"
                      value={stockEdits[product.id] ?? String(product.stock)}
                      onChange={e =>
                        setStockEdits(prev => ({ ...prev, [product.id]: e.target.value }))
                      }
                      placeholder="-1"
                      className="form-control form-control-sm"
                      style={{ ...OHGO_INPUT, backgroundColor: '#FFFFFF', margin: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleStockSave(product.id)}
                      className="btn btn-sm fw-semibold flex-shrink-0"
                      style={{
                        ...OHGO_PRIMARY_BTN,
                        padding: '10px 14px',
                        fontSize: 13,
                        boxShadow: 'none',
                        minWidth: 72,
                      }}
                    >
                      저장
                    </button>
                  </div>
                  <p className="mb-0 mt-2" style={{ fontSize: 11, color: '#6F767E', fontFamily: FONT }}>
                    -1 입력 시 무제한 재고
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SubPageFrame>
  );
}
