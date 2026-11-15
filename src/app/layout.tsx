import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: { default: "CareCircle — caring together for the ones who cared for us", template: "%s · CareCircle" },
  description:
    "CareCircle helps elderly people, caretakers and family manage medicines, doctor visits and reminders together — with Gemini-powered prescription scanning and a voice-first Elder Mode.",
  applicationName: "CareCircle",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The per-request CSP nonce (see src/proxy.ts) authorises our one bootstrap script.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} min-h-screen`}>
        <Script src="/text-size.js" strategy="beforeInteractive" nonce={nonce} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
