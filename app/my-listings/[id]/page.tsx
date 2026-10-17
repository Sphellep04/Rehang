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
import { PhotoEditor, type StoredPhoto } from "./photo-editor";

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
    .select("id,title,description,brand_text,price_cents,shipping_cents,status,condition")
    .eq("id", id)
    .eq("seller_id", viewerId)
    .maybeSingle();
  if (!item) notFound();
  const { data: flagRows } = await supabase.from("app_config").select("key,value").in("key", ["courier_enabled", "payments_enabled"]);
  const delivery = (flagRows ?? []).length === 2 && (flagRows ?? []).every((row) => row.value === true);
  const { data: photoRows } = await supabase
    .from("item_photos")
    .select("id,kind,position,path_thumb,path_card,path_full,width,height,phash")
    .eq("item_id", id)
    .order("position");
  const stored: StoredPhoto[] = (photoRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as StoredPhoto["kind"],
    previewUrl: supabase.storage.from("item-photos").getPublicUrl(row.path_card as string).data.publicUrl,
    paths: { thumb: row.path_thumb as string, card: row.path_card as string, full: row.path_full as string },
    width: row.width as number,
    height: row.height as number,
    phash: (row.phash as string | null) ?? null,
  }));
  const editable = ["draft", "awaiting_verification", "active"].includes(item.status as string);

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <Link className="plain-button" href="/my-listings">← My listings</Link>
        <h1 className="browse-title">Edit <em>listing.</em></h1>
        {editable
          ? <>
              <EditForm itemId={item.id as string} title={item.title as string} description={(item.description as string | null) ?? ""} brand={(item.brand_text as string | null) ?? ""} priceDollars={Math.round(Number(item.price_cents) / 100)} live={item.status === "active"} delivery={delivery} postageDollars={item.shipping_cents == null ? null : Math.round(Number(item.shipping_cents) / 100)} />
              <PhotoEditor itemId={item.id as string} condition={item.condition as string} stored={stored} />
            </>
          : <p className="trade-hint">This listing can&apos;t be edited while it is {item.status === "reserved" ? "reserved for a buyer" : item.status}.</p>}
      </section>
    </main>
  );
}
