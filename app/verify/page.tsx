import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verify your ID | Rehang" };

export default function VerifyPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <VerifyContent />
    </Suspense>
  );
}

async function VerifyContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const [{ data: me }, { data: latest }] = await Promise.all([
    supabase.from("users").select("verification_level").eq("id", viewerId).maybeSingle(),
    supabase.from("verifications").select("status,rejection_reason,created_at").eq("user_id", viewerId).eq("type", "id_document").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const verified = me?.verification_level === "level2";
  const pending = latest?.status === "pending" || latest?.status === "escalated";

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">TRUST</p>
        <h1 className="browse-title">Verify your <em>ID.</em></h1>
        <p className="order-summary">Verified people can buy and sell without order limits, and their listings show a verified badge.</p>

        <ol className="verify-steps">
          <li className="done"><span>✓</span> Email confirmed. You can buy up to the Level 1 limits.</li>
          <li className={verified ? "done" : pending ? "active" : ""}><span>{verified ? "✓" : "2"}</span> ID and selfie checked by our team. Removes buying limits and lets your listings go live.</li>
        </ol>

        {verified && <p className="trade-success" role="status">You are verified. Thank you for helping keep Rehang safe.</p>}
        {!verified && pending && <p className="trade-hint">Your documents are with our team. We usually reply within a day.</p>}
        {!verified && !pending && (
          <>
            {latest?.status === "rejected" && <p className="inline-error" role="alert">Your last attempt was not approved: {latest.rejection_reason ?? "please try again with clearer photos"}.</p>}
            <VerifyForm userId={viewerId} />
          </>
        )}
        <p className="trade-hint"><Link href="/orders">Back to orders</Link></p>
      </section>
    </main>
  );
}
