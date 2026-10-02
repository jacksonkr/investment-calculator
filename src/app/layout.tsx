import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NATIVE } from "@/lib/native";
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
  title: "Investment Calculator",
  description:
    "See how money could grow in the markets. A hypothetical, no-account sandbox for exploring investment ideas.",
};

// The iOS app draws edge to edge (see the safe-area padding in globals.css)
// and, like a native app, doesn't pinch-zoom or zoom into focused fields.
export const viewport: Viewport = NATIVE
  ? { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" }
  : { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${NATIVE ? "native" : ""}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
