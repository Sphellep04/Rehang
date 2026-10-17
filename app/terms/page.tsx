import type { Metadata } from "next";
import { PolicyPage } from "../_components/policy-page";

export const metadata: Metadata = { title: "Terms of Use | Rehang", description: "Rehang Terms of Use (draft pending legal review)." };

export default function Page() {
  return <PolicyPage slug="terms-of-use" />;
}
