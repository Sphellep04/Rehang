import type { Metadata } from "next";
import { PolicyPage } from "../_components/policy-page";

export const metadata: Metadata = { title: "Privacy Policy | Rehang", description: "Rehang Privacy Policy (draft pending legal review)." };

export default function Page() {
  return <PolicyPage slug="privacy-policy" />;
}
