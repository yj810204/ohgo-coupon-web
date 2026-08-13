import Link from 'next/link';
import { SAMPLE_HUB_ITEMS } from '@/lib/samples/mock-data';

export default function SamplesHubPage() {
  return (
    <div className="min-vh-100" style={{ backgroundColor: '#F7F8FA', padding: '48px 20px 40px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#1B6FF5',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Portfolio Samples
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1A1D1F', margin: '0 0 8px' }}>
          오고피씽 샘플
        </h1>
        <p style={{ fontSize: 14, color: '#6F767E', margin: '0 0 28px', lineHeight: 1.5 }}>
          로그인·API 없이 더미 데이터로 렌더됩니다. 포트폴리오 캡처용이며 검색엔진에 노출되지 않습니다.
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SAMPLE_HUB_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#fff',
                  borderRadius: 14,
                  padding: '16px 18px',
                  textDecoration: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D1F' }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{item.note}</div>
                </div>
                <span style={{ color: '#1B6FF5', fontWeight: 700 }}>→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
