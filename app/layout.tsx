import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rehang | Good clothes, second rounds",
  description: "Rehang is a Windhoek-first marketplace for buying and selling second-hand clothes. Preview examples while the marketplace is being built.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
