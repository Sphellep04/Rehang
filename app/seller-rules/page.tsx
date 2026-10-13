import type { Metadata } from "next";
import { PolicyPage } from "../_components/policy-page";

export const metadata: Metadata = { title: "Seller rules | Rehang", description: "Rehang Seller rules (draft pending legal review)." };

export default function Page() {
  return <PolicyPage slug="seller-rules" />;
}
