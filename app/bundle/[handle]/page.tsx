import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { listingsForSeller } from "@/lib/listings";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";
import { BundleBuilder } from "./bundle-builder";

export const metadata: Metadata = { title: "Build a bundle | Rehang" };

export default function BundlePage(props: PageProps<"/bundle/[handle]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <BundleContent params={props.params} />
    </Suspense>
  );
}

async function BundleContent({ params }: { params: Promise<{ handle: string }> }) {
  await connection();
  const { handle } = await params;
  if (!isSupabaseConfigured() || !/^[a-z0-9_]{3,30}$/.test(handle)) notFound();
  const supabase = await createClient();
  const viewerId = await getViewerId();
  const { data: seller } = await supabase.from("public_profiles").select("id,display_name,handle").eq("handle", handle).maybeSingle();
  if (!seller) notFound();
  const { data: config } = await supabase.from("app_config").select("key,value").in("key", ["bundles_enabled", "bundle_discount_percent", "bundle_min_items"]);
  const value = (key: string) => (config ?? []).find((row) => row.key === key)?.value;
  if (value("bundles_enabled") !== true) redirect(`/${handle}`);
  const percent = Number(value("bundle_discount_percent") ?? 10) || 10;
  const minimum = Number(value("bundle_min_items") ?? 3) || 3;
  const listings = await listingsForSeller(supabase, seller.id as string, "active");

  return (
    <main>
      <SiteHeader signedIn={viewerId !== null} />
      <section className="browse order-page">
        <Link className="plain-button" href={`/${handle}`}>← {seller.display_name as string}</Link>
        <p className="eyebrow">BUNDLE AND SAVE</p>
        <h1 className="browse-title">Pick {minimum} or more from <em>{seller.display_name as string}.</em></h1>
        <p className="trade-hint">Take {minimum} to 10 items from this seller and save {percent}%. You meet once, pay the seller in person, and all items are handed over together.</p>
        {viewerId === seller.id
          ? <p className="trade-hint">This is your own shop, so you can&apos;t buy from it.</p>
          : <BundleBuilder
              signedIn={viewerId !== null}
              handle={handle}
              minimum={minimum}
              percent={percent}
              items={listings.map((l) => ({ id: l.id, title: l.title, price: l.price, image: l.thumb ?? l.image, size: l.size }))}
            />}
      </section>
    </main>
  );
}
