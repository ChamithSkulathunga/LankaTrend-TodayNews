
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "LankaTrend | Sri Lanka Latest News",
    template: "%s | LankaTrend",
  },
  description:
    "Stay updated with the latest Sri Lankan news, breaking news, world news, sports, business, and trending stories on LankaTrend.",
  applicationName: "LankaTrend",
  keywords: [
    "LankaTrend",
    "Sri Lanka News",
    "Latest News Sri Lanka",
    "Breaking News",
    "World News",
    "Sports News",
  ],
  icons: {
    icon: "/app/icon.png",
    shortcut: "/app/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "LankaTrend | Sri Lanka Latest News",
    description:
      "Your daily source for Sri Lankan news, breaking stories, world news, and sports.",
    siteName: "LankaTrend",
    type: "website",
    locale: "en_LK",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
