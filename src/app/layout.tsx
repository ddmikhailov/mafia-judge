import type { Metadata, Viewport } from "next";
import { Inter, Unbounded } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const inter = Inter({
  subsets: ["cyrillic", "latin"],
  variable: "--font-inter",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  variable: "--font-unbounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Судья миникапа",
  description: "Проведение миникапа РФМ",
  applicationName: "Судья миникапа",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Судья" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-maskable.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#7d2760" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${inter.variable} ${unbounded.variable}`}>
      <body><AppHeader />{children}</body>
    </html>
  );
}
