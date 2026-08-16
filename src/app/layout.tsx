import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "All World PDF | PDF Handwriting Converter",
  description:
    "Convert Arabic and English PDF text into handwriting-style documents with OCR support.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${cairo.variable} ${inter.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
