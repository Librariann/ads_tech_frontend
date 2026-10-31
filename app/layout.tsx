import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { publicSite } from "@/lib/public-site";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  weight: "variable",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicSite.url),
  title: {
    default: "GrowdoAds",
    template: "%s | GrowdoAds",
  },
  description: publicSite.description,
  icons: {
    icon: "/growdoads-kakao-icon.png",
    apple: "/growdoads-kakao-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
