import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { THEME_COOKIE, resolveTheme } from "@/lib/theme";

/**
 * Three fonts, three jobs (PRD §18.3), self-hosted via next/font (no runtime CDN
 * link — staff are often on restricted networks). next/font/google downloads and
 * serves the files from our own origin at build time.
 *   Barlow Condensed → display, nav, buttons, tags, KPI numerals (uppercase)
 *   JetBrains Mono    → anything that is data (ids, phones, amounts, timestamps)
 *   Manrope           → anything read as prose (names, message bodies, paragraphs)
 */
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
const body = Manrope({
  subsets: ["latin"],
  weight: ["200", "400", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "20FIT CRM", template: "%s · 20FIT CRM" },
  description: "20FIT Audience Data & CRM — internal marketing operations.",
  // Internal tool holding PII — keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = resolveTheme(cookies().get(THEME_COOKIE)?.value);
  return (
    <html lang="id" data-theme={theme} suppressHydrationWarning>
      <body className={`${display.variable} ${mono.variable} ${body.variable} font-body`}>
        {children}
      </body>
    </html>
  );
}
