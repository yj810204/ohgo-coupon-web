import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 모드 하단 N(Dev Indicator) 버튼 비표시
  devIndicators: false,
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
