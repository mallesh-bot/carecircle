import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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

// Applies the saved text-size preference before paint to avoid a flash.
const textSizeScript = `try{if(localStorage.getItem("cc-text")==="large")document.documentElement.dataset.text="large"}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: textSizeScript }} />
      </head>
      <body className={`${geistSans.variable} min-h-screen`}>
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
