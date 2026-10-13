import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./_components/register-sw";

export const metadata: Metadata = {
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
      </body>
    </html>
  );
}
