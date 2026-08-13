import type { Metadata } from 'next';
import SampleTabBar from '@/components/samples/SampleTabBar';

export const metadata: Metadata = {
  title: '포트폴리오 샘플 | 오고피씽',
  description: '낚시 선박 스탬프·쿠폰 SaaS 포트폴리오용 데모 화면',
  robots: { index: false, follow: false },
};

export default function SamplesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SampleTabBar />
    </>
  );
}
