import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rehang | Good clothes, second rounds",
  description: "Find pre-loved fashion from verified sellers in Windhoek. Clear your closet and give good clothes another life.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
