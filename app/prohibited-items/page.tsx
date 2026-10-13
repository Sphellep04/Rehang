import type { Metadata } from "next";
import { PolicyPage } from "../_components/policy-page";

export const metadata: Metadata = { title: "Prohibited items | Rehang", description: "Rehang Prohibited items (draft pending legal review)." };

export default function Page() {
  return <PolicyPage slug="prohibited-items" />;
}
