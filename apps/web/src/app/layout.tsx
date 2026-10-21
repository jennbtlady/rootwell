import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Paste is designed around Inter.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Rootwell", template: "%s | Rootwell" },
  description: "A simple donor database for small nonprofits.",
  applicationName: "Rootwell",
  appleWebApp: { capable: true, title: "Maple", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#500030",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
