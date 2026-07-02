import type { Metadata } from "next";
import {
  Instrument_Serif,
  Inter_Tight,
  Spline_Sans_Mono,
} from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const sans = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const mono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Findling: video moments, licensed in a tap",
  description:
    "An agent-payable marketplace for licensable video moments. Creators and finders get paid the instant an AI agent licenses one, in USDC on Arc.",
  icons: {
    icon: [{ url: "/brand/favicon-bracket.svg", type: "image/svg+xml" }],
  },
};

/**
 * Pre-paint theme init — resolves the app-wide light/dark mode before the body
 * paints so there's no flash. Default is `dark` (the cinematic brand default,
 * matching the landing); a stored preference wins. The palette itself lives in
 * globals.css as CSS variables on `:root` (cream) and `.dark` (cinema).
 * Cinematic surfaces (landing, feed, trace) carry their own local `.dark`, so
 * they stay dark regardless of this global mode.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('findling-theme');if(t!=='light'&&t!=='dark')t='dark';var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.style.colorScheme=t;}catch(e){var d=document.documentElement;d.classList.add('dark');d.style.colorScheme='dark';}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      {/* suppress hydration noise from browser extensions (Grammarly etc.) that
          inject attributes on <body> before React hydrates */}
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
