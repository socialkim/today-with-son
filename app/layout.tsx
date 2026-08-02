import type { Metadata } from "next";
import { Noto_Sans_KR, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const notoSans = Noto_Sans_KR({
  variable: "--font-korean",
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.includes("localhost") ? "http" : "https");
  const base = new URL(host ? `${protocol}://${host}` : "http://localhost:3000");
  const socialImage = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title: "오늘, 아들과 — 초4 맞춤 서울 나들이 레이더",
    description:
      "서울 실시간 혼잡도와 초등학교 4학년 아이의 재미를 함께 계산해 오늘 갈 곳을 추천합니다.",
    applicationName: "오늘, 아들과",
    openGraph: {
      title: "오늘, 아들과 — 검색은 그만. 오늘의 모험만 고르자.",
      description: "실시간 혼잡도 × 초4 맞춤 서울 나들이 추천",
      locale: "ko_KR",
      type: "website",
      url: base,
      images: [
        {
          url: socialImage,
          width: 1200,
          height: 630,
          alt: "오늘, 아들과 — 초4 맞춤 서울 나들이",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "오늘, 아들과",
      description: "실시간 혼잡도 × 초4 맞춤 서울 나들이 추천",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSans.variable} ${spaceMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
