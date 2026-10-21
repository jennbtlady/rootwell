import type { Metadata, Viewport } from "next";
import { Fredoka, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Paste is designed around Inter.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Headings use Fredoka Medium, the lettering of the Rootwell logo (Jenn, 2026-10-21).
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], weight: "500" });

export const metadata: Metadata = {
  title: { default: "Rootwell", template: "%s | Rootwell" },
  description: "A simple donor database for small nonprofits.",
  applicationName: "Rootwell",
  appleWebApp: { capable: true, title: "Rootwell", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#500030",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} ${fredoka.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
