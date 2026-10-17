import type { Metadata } from "next";
import { PolicyPage } from "../_components/policy-page";

export const metadata: Metadata = { title: "Buyer protection | Rehang", description: "Rehang Buyer protection (draft pending legal review)." };

export default function Page() {
  return <PolicyPage slug="buyer-protection" />;
}
