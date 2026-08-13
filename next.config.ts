import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 개발 모드 하단 N(Dev Indicator) 버튼 비표시
  devIndicators: false,
  // Supabase 미생성 Database 타입으로 인한 임시 우회 (배포 복구용)
  typescript: {
    ignoreBuildErrors: true,
  },
  // 뒤로가기/탭 재방문 시 클라이언트 라우터 캐시
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
