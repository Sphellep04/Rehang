import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ source: "examples" as const, listings: null });
  }

  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("items")
    .select("id,seller_id,title,condition,price_cents,published_at,category_id,size_id,item_photos(path_card,kind,position)")
    .eq("status", "active")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(48);

  if (error) {
    return NextResponse.json({ error: "listings_unavailable" }, { status: 503 });
  }

  const categoryIds = [...new Set((items ?? []).map((item) => item.category_id))];
  const sizeIds = [...new Set((items ?? []).map((item) => item.size_id))];
  const sellerIds = [...new Set((items ?? []).map((item) => item.seller_id))];

  const [{ data: categories }, { data: sizes }, { data: profiles }] = await Promise.all([
    categoryIds.length
      ? supabase.from("categories").select("id,name").in("id", categoryIds)
      : Promise.resolve({ data: [] }),
    sizeIds.length
      ? supabase.from("sizes").select("id,value").in("id", sizeIds)
      : Promise.resolve({ data: [] }),
    sellerIds.length
      ? supabase.from("public_profiles").select("id,display_name,is_trusted_seller,verification_level").in("id", sellerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const categoryById = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const sizeById = new Map((sizes ?? []).map((size) => [size.id, size.value]));
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const listings = (items ?? []).map((item) => {
    const photo = [...(item.item_photos ?? [])]
      .sort((first, second) => first.position - second.position)
      .find((candidate) => candidate.kind === "front") ?? item.item_photos?.[0];
    const profile = profileById.get(item.seller_id);
    const image = photo
      ? supabase.storage.from("item-photos").getPublicUrl(photo.path_card).data.publicUrl
      : "";

    return {
      id: item.id,
      title: item.title,
      category: categoryById.get(item.category_id) ?? "Clothing",
      size: sizeById.get(item.size_id) ?? "One size",
      condition: item.condition.replaceAll("_", " "),
      price: Math.round(item.price_cents / 100),
      image,
      sellerId: item.seller_id,
      seller: profile?.display_name ?? "Rehang seller",
      trusted: profile?.is_trusted_seller ?? false,
      verified: profile?.verification_level === "level2",
      isExample: false as const,
    };
  });

  return NextResponse.json({ source: "live" as const, listings });
}
