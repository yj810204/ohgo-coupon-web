import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { AuthProvider } from "@/contexts/AuthContext";
import PageLoader from "@/components/PageLoader";
import SiteTitle from "@/components/SiteTitle";
import BottomTabBar from "@/components/BottomTabBar";
import NativeBridgeInit from "@/components/NativeBridgeInit";
import OhgoDialogHost from "@/components/OhgoDialogHost";
import AppPopupHost from "@/components/AppPopupHost";
import ClientErrorBoundary from "@/components/ClientErrorBoundary";

export const metadata: Metadata = {
  title: "오고피씽",
  description: "오고피씽 - 낚시 미니게임과 포인트 시스템",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 동일 출처 — Google/jsDelivr @import 체인 제거 (모바일 FCP) */}
        <link rel="stylesheet" href="/vendor/bootstrap.min.css" />
        {/* 본문 Regular만 선로딩. Bold는 CSS가 요청하고 Title은 제목 전용이라 빼 둔다. */}
        <link
          rel="preload"
          href="/fonts/onemobile/ONEMobile-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <NativeBridgeInit />
        <SiteTitle />
        <AuthProvider>
          <LoadingProvider>
            <div className="container-fluid px-0 bg-gray-50">
              {children}
            </div>
            <BottomTabBar />
            <PageLoader />
            <OhgoDialogHost />
            <ClientErrorBoundary>
              <AppPopupHost />
            </ClientErrorBoundary>
          </LoadingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
