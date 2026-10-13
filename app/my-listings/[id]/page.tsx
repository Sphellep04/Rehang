import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";
import { EditForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit listing | Rehang" };

export default function EditListingPage(props: PageProps<"/my-listings/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading listing…" />}>
      <EditContent params={props.params} />
    </Suspense>
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/");
  if (!uuid.test(id)) notFound();
  const viewerId = await getViewerId();
  if (!viewerId) redirect(`/login?next=/my-listings/${id}`);

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("items")
    .select("id,title,description,brand_text,price_cents,status")
    .eq("id", id)
    .eq("seller_id", viewerId)
    .maybeSingle();
  if (!item) notFound();
  const editable = ["draft", "awaiting_verification", "active"].includes(item.status as string);

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <Link className="plain-button" href="/my-listings">← My listings</Link>
        <h1 className="browse-title">Edit <em>listing.</em></h1>
        {editable
          ? <EditForm itemId={item.id as string} title={item.title as string} description={(item.description as string | null) ?? ""} brand={(item.brand_text as string | null) ?? ""} priceDollars={Math.round(Number(item.price_cents) / 100)} live={item.status === "active"} />
          : <p className="trade-hint">This listing can&apos;t be edited while it is {item.status === "reserved" ? "reserved for a buyer" : item.status}.</p>}
      </section>
    </main>
  );
}
