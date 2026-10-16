import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { dataSaverOn } from "./data-saver";

export const PAGE_SIZE = 24;

export const CONDITIONS = ["new_with_tags", "new_without_tags", "very_good", "good", "fair"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const conditionLabel: Record<Condition, string> = {
  new_with_tags: "New with tags",
  new_without_tags: "New without tags",
  very_good: "Very good",
  good: "Good",
  fair: "Fair",
};

export const SORTS = ["newest", "trusted", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export type Listing = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  size: string;
  condition: string;
  conditionKey: Condition;
  price: number;
  image: string;
  /** Small photo, used in lists when data saver is on. */
  thumb?: string;
  /** True when data saver is on, so lists should use the small photo. */
  lite?: boolean;
  sellerId: string;
  seller: string;
  sellerHandle: string;
  verified: boolean;
  trusted: boolean;
  /** A moderator compared the label and stitching photos. Not a guarantee of authenticity. */
  photosReviewed?: boolean;
  town: string;
  status: "draft" | "awaiting_verification" | "active" | "reserved" | "sold" | "removed";
  publishedAt: string | null;
  isExample: boolean;
};

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : undefined),
    z.string().optional(),
  );

// Query strings are user input: anything that is not a sensible number is ignored, never an error.
const optionalNumber = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : undefined;
}, z.number().optional());

export const filtersSchema = z.object({
  q: optionalText(80),
  category: optionalText(60),
  sizeGroup: optionalText(20),
  town: optionalText(40),
  brand: optionalText(60),
  condition: z.preprocess(
    (value) => (typeof value === "string" && (CONDITIONS as readonly string[]).includes(value) ? value : undefined),
    z.enum(CONDITIONS).optional(),
  ),
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  sort: z.preprocess(
    (value) => (typeof value === "string" && (SORTS as readonly string[]).includes(value) ? value : "newest"),
    z.enum(SORTS),
  ),
  page: z.preprocess(
    (value) => {
      const page = typeof value === "string" ? Number.parseInt(value, 10) : 1;
      return Number.isInteger(page) && page >= 1 && page <= 200 ? page : 1;
    },
    z.number().int(),
  ),
});

export type ListingFilters = z.infer<typeof filtersSchema>;

export function parseFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): ListingFilters {
  const read = (key: string) => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const parsed = filtersSchema.safeParse({
    q: read("q"),
    category: read("category"),
    sizeGroup: read("size"),
    town: read("town"),
    brand: read("brand"),
    condition: read("condition"),
    minPrice: read("min"),
    maxPrice: read("max"),
    sort: read("sort"),
    page: read("page"),
  });

  // Every field already falls back to a default, so this only guards against surprises.
  return parsed.success ? parsed.data : filtersSchema.parse({});
}

type CategoryRow = { id: number; parent_id: number | null; name: string; slug: string };

/** Ids of the category matching the slug plus every descendant, so "Women" includes "Women's dresses". */
export function categoryIdsFor(slug: string, categories: CategoryRow[]): number[] {
  const root = categories.find((category) => category.slug === slug);
  if (!root) return [];
  const ids = new Set<number>([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parent_id !== null && ids.has(category.parent_id) && !ids.has(category.id)) {
        ids.add(category.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

export const ITEM_COLUMNS =
  "id,seller_id,title,description,condition,price_cents,status,published_at,photos_reviewed_at,category_id,size_id,town_id,item_photos(path_card,path_thumb,kind,position)";

type ItemRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  condition: Condition;
  price_cents: number;
  status: "draft" | "awaiting_verification" | "active" | "reserved" | "sold" | "removed";
  published_at: string | null;
  photos_reviewed_at?: string | null;
  category_id: number;
  size_id: number;
  town_id: number;
  item_photos: { path_card: string; path_thumb: string; kind: string; position: number }[] | null;
};

/** Turns raw item rows into Listings, resolving names and photo URLs in three small lookups. */
export async function hydrateListings(supabase: SupabaseClient, rows: ItemRow[]): Promise<Listing[]> {
  if (rows.length === 0) return [];

  const unique = <T,>(values: T[]) => [...new Set(values)];
  const lite = await dataSaverOn();
  const [categories, sizes, towns, profiles] = await Promise.all([
    supabase.from("categories").select("id,name").in("id", unique(rows.map((row) => row.category_id))),
    supabase.from("sizes").select("id,value").in("id", unique(rows.map((row) => row.size_id))),
    supabase.from("towns").select("id,name").in("id", unique(rows.map((row) => row.town_id))),
    supabase
      .from("public_profiles")
      .select("id,handle,display_name,is_trusted_seller,verification_level")
      .in("id", unique(rows.map((row) => row.seller_id))),
  ]);

  const categoryById = new Map((categories.data ?? []).map((row) => [row.id as number, row.name as string]));
  const sizeById = new Map((sizes.data ?? []).map((row) => [row.id as number, row.value as string]));
  const townById = new Map((towns.data ?? []).map((row) => [row.id as number, row.name as string]));
  const profileById = new Map((profiles.data ?? []).map((row) => [row.id as string, row]));

  return rows.map((row) => {
    const photos = [...(row.item_photos ?? [])].sort((first, second) => first.position - second.position);
    const photo = photos.find((candidate) => candidate.kind === "front") ?? photos[0];
    const profile = profileById.get(row.seller_id);

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: categoryById.get(row.category_id) ?? "Clothing",
      size: sizeById.get(row.size_id) ?? "One size",
      condition: conditionLabel[row.condition] ?? row.condition,
      conditionKey: row.condition,
      price: Math.round(row.price_cents / 100),
      image: photo ? supabase.storage.from("item-photos").getPublicUrl(photo.path_card).data.publicUrl : "",
      thumb: photo ? supabase.storage.from("item-photos").getPublicUrl(photo.path_thumb).data.publicUrl : "",
      lite,
      sellerId: row.seller_id,
      seller: (profile?.display_name as string | undefined) ?? "Rehang seller",
      sellerHandle: (profile?.handle as string | undefined) ?? "",
      verified: profile?.verification_level === "level2",
      trusted: Boolean(profile?.is_trusted_seller),
      photosReviewed: Boolean(row.photos_reviewed_at),
      town: townById.get(row.town_id) ?? "Windhoek",
      status: row.status,
      publishedAt: row.published_at,
      isExample: false,
    } satisfies Listing;
  });
}

export type ListingPage = { listings: Listing[]; hasMore: boolean; total: number | null };

/** Browse and search active listings. RLS decides what the caller may see. */
export async function searchListings(supabase: SupabaseClient, filters: ListingFilters): Promise<ListingPage | null> {
  const [categoriesResult, sizesResult, townResult, brandResult] = await Promise.all([
    filters.category ? supabase.from("categories").select("id,parent_id,name,slug") : Promise.resolve({ data: null }),
    filters.sizeGroup
      ? supabase.from("sizes").select("id,size_groups!inner(label)").eq("size_groups.label", filters.sizeGroup)
      : Promise.resolve({ data: null }),
    filters.town ? supabase.from("towns").select("id").ilike("name", filters.town.replace(/[%_\\]/g, "")).limit(1) : Promise.resolve({ data: null }),
    filters.brand ? supabase.from("brands").select("id").eq("slug", filters.brand.toLowerCase()).limit(1) : Promise.resolve({ data: null }),
  ]);

  // A failed lookup is an outage, not "no matches".
  if (("error" in categoriesResult && categoriesResult.error) || ("error" in sizesResult && sizesResult.error) || ("error" in townResult && townResult.error) || ("error" in brandResult && brandResult.error)) return null;

  let categoryIds: number[] | null = null;
  if (filters.category) {
    categoryIds = categoryIdsFor(filters.category, (categoriesResult.data ?? []) as CategoryRow[]);
    if (categoryIds.length === 0) return { listings: [], hasMore: false, total: 0 };
  }

  let sizeIds: number[] | null = null;
  if (filters.sizeGroup) {
    sizeIds = ((sizesResult.data ?? []) as { id: number }[]).map((row) => row.id);
    if (sizeIds.length === 0) return { listings: [], hasMore: false, total: 0 };
  }

  let townId: number | null = null;
  if (filters.town) {
    const found = ((townResult.data ?? []) as { id: number }[])[0];
    if (!found) return { listings: [], hasMore: false, total: 0 };
    townId = found.id;
  }

  let brandId: number | null = null;
  if (filters.brand) {
    const found = ((brandResult.data ?? []) as { id: number }[])[0];
    if (!found) return { listings: [], hasMore: false, total: 0 };
    brandId = found.id;
  }

  const base = filters.q
    ? supabase.rpc("items_search", { p_query: filters.q }, { count: "exact" }).select(ITEM_COLUMNS)
    : supabase.from("items").select(ITEM_COLUMNS, { count: "exact" });

  let query = base.eq("status", "active");
  if (categoryIds) query = query.in("category_id", categoryIds);
  if (sizeIds) query = query.in("size_id", sizeIds);
  if (townId !== null) query = query.eq("town_id", townId);
  if (brandId !== null) query = query.eq("brand_id", brandId);
  if (filters.condition) query = query.eq("condition", filters.condition);
  if (filters.minPrice !== undefined) query = query.gte("price_cents", Math.round(filters.minPrice * 100));
  if (filters.maxPrice !== undefined) query = query.lte("price_cents", Math.round(filters.maxPrice * 100));

  query =
    filters.sort === "price_asc"
      ? query.order("price_cents", { ascending: true })
      : filters.sort === "price_desc"
        ? query.order("price_cents", { ascending: false })
        : filters.sort === "trusted"
          ? query.order("seller_trusted", { ascending: false }).order("published_at", { ascending: false, nullsFirst: false })
          : query.order("published_at", { ascending: false, nullsFirst: false });

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.order("id").range(from, from + PAGE_SIZE - 1);
  if (error) return null;

  const rows = (data ?? []) as unknown as ItemRow[];
  return {
    listings: await hydrateListings(supabase, rows),
    hasMore: count !== null ? from + rows.length < count : rows.length === PAGE_SIZE,
    total: count,
  };
}

export async function getListing(supabase: SupabaseClient, id: string): Promise<Listing | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const [listing] = await hydrateListings(supabase, [data as unknown as ItemRow]);
  return listing ?? null;
}

export async function listingsForSeller(supabase: SupabaseClient, sellerId: string, status: "active" | "sold"): Promise<Listing[]> {
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("seller_id", sellerId)
    .eq("status", status)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(48);
  if (error) return [];
  return hydrateListings(supabase, (data ?? []) as unknown as ItemRow[]);
}

export function formatPrice(amount: number) {
  return `N$${amount.toLocaleString("en-ZA")}`;
}

/** Every listing the signed-in seller owns, in any status. Row security limits this to the owner. */
export async function myListings(supabase: SupabaseClient, sellerId: string): Promise<(Listing & { removedReason: string | null })[]> {
  const { data, error } = await supabase
    .from("items")
    .select(`${ITEM_COLUMNS},removed_reason`)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const rows = data as unknown as (ItemRow & { removed_reason: string | null })[];
  const listings = await hydrateListings(supabase, rows);
  const reason = new Map(rows.map((row) => [row.id, row.removed_reason]));
  return listings.map((listing) => ({ ...listing, removedReason: reason.get(listing.id) ?? null }));
}
