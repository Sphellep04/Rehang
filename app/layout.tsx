import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { siteUrl } from "@/lib/site";
import { SiteSignals } from "./_components/share-landing";
import { RegisterServiceWorker } from "./_components/register-sw";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  openGraph: { siteName: "Rehang", type: "website", locale: "en_NA" },
  twitter: { card: "summary_large_image" },
  title: "Rehang | Good clothes, second rounds",
  icons: { apple: "/apple-touch-icon.png" },
  description: "Rehang is a Windhoek-first marketplace for buying and selling second-hand clothes. Preview examples while the marketplace is being built.",
};

export const viewport: Viewport = { themeColor: "#e4572e" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
        <Suspense fallback={null}><SiteSignals /></Suspense>
      </body>
    </html>
  );
}
