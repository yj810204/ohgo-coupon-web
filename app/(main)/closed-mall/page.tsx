'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/storage';
import SubPageFrame from '@/components/SubPageFrame';
import ProductGridCard from '@/components/home/ProductGridCard';
import { CLOSED_MALL_PRODUCTS } from '@/constants/closed-mall';

export default function ClosedMallPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      const user = await getUser();
      if (!user?.uuid) {
        router.replace('/login');
        return;
      }
      setReady(true);
    };
    void check();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ backgroundColor: '#F7F8FA' }}>
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <SubPageFrame title="오고피씽몰">
        <p className="mb-4" style={{ fontSize: 13, color: '#6F767E', fontFamily: "'Urbanist', var(--font-urbanist), sans-serif" }}>
          오고피씽 회원 전용 혜택 상품입니다. 상세 주문 기능은 준비 중입니다.
        </p>
        <div className="row g-3">
          {CLOSED_MALL_PRODUCTS.map((product) => (
            <div key={product.id} className="col-6">
              <ProductGridCard
                product={product}
                onClick={() => alert('오고피씽몰 주문 기능은 곧 제공될 예정입니다.')}
              />
            </div>
          ))}
        </div>
    </SubPageFrame>
  );
}
