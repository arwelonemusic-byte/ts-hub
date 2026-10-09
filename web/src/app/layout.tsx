import type { Metadata } from "next";
import { Roboto, Roboto_Mono, Roboto_Slab } from "next/font/google";
import { getLocale } from "@/lib/i18n-server";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin", "cyrillic"], weight: ["400", "500", "700"] });
const robotoSlab = Roboto_Slab({ variable: "--font-roboto-slab", subsets: ["latin", "cyrillic"], weight: ["300", "500"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin", "cyrillic"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "TS Hub",
  description: "Tactical Shift — events, missions, plans and replays in one place",
  icons: { icon: "/ts-logo.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${roboto.variable} ${robotoSlab.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-page font-sans text-fg-body">{children}</body>
    </html>
  );
}
