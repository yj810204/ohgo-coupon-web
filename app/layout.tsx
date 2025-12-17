import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import { LoadingProvider } from "@/contexts/LoadingContext";
import PageLoader from "@/components/PageLoader";
import SiteTitle from "@/components/SiteTitle";
import BottomTabBar from "@/components/BottomTabBar";

export const metadata: Metadata = {
  title: "오고피씽",
  description: "오고피씽 - 낚시 미니게임과 포인트 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <SiteTitle />
        <LoadingProvider>
          <div className="container-fluid pt-3 px-0 bg-gray-50">
            {children}
          </div>
          <BottomTabBar />
          <PageLoader />
          <Script
            src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"
            strategy="afterInteractive"
            crossOrigin="anonymous"
          />
        </LoadingProvider>
      </body>
    </html>
  );
}
