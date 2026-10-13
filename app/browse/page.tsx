import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "../_components/page-loading";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { CONDITIONS, conditionLabel, parseFilters, searchListings, type ListingFilters } from "@/lib/listings";
import { savedIdsFor } from "@/lib/saved";
import { ListingCard } from "../_components/listing-card";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = {
  title: "Browse second-hand clothes | Rehang",
  description: "Search and filter second-hand clothes listed by sellers in Windhoek.",
};

function pageHref(filters: ListingFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.sizeGroup) params.set("size", filters.sizeGroup);
  if (filters.condition) params.set("condition", filters.condition);
  if (filters.minPrice !== undefined) params.set("min", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("max", String(filters.maxPrice));
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/browse?${query}` : "/browse";
}

export default function BrowsePage({ searchParams }: PageProps<"/browse">) {
  return (
    <Suspense fallback={<PageLoading label="Loading listings…" />}>
      <BrowseContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BrowseContent({ searchParams }: { searchParams: PageProps<"/browse">["searchParams"] }) {
  const filters = parseFilters(await searchParams);
  const configured = isSupabaseConfigured();
  const supabase = configured ? await createClient() : null;
  const viewerId = await getViewerId();
  const signedIn = viewerId !== null;

  const [result, categories, sizeGroups] = supabase
    ? await Promise.all([
        searchListings(supabase, filters),
        supabase.from("categories").select("slug,name,position").is("parent_id", null).eq("allowed", true).order("position"),
        supabase.from("size_groups").select("label,position").order("position"),
      ])
    : [null, { data: [] }, { data: [] }];

  const saved = supabase && result ? await savedIdsFor(supabase, result.listings.map((listing) => listing.id)) : new Set<string>();
  const sizeLabels = [...new Set((sizeGroups.data ?? []).map((group) => group.label as string))];
  const hasFilters = Boolean(filters.q || filters.category || filters.sizeGroup || filters.condition || filters.minPrice !== undefined || filters.maxPrice !== undefined);

  return (
    <main>
      <SiteHeader signedIn={signedIn} query={filters.q} />
      <section className="browse">
        <div className="section-heading">
          <div>
            <p className="eyebrow">WINDHOEK</p>
            <h1 className="browse-title">{filters.q ? <>Results for <em>“{filters.q}”</em></> : <>Browse <em>everything.</em></>}</h1>
          </div>
          <p>{result?.total !== null && result ? `${result.total} ${result.total === 1 ? "piece" : "pieces"}` : ""}</p>
        </div>

        <form className="filter-bar" action="/browse" method="get">
          {filters.q && <input type="hidden" name="q" value={filters.q} />}
          <label>Category
            <select name="category" defaultValue={filters.category ?? ""}>
              <option value="">All</option>
              {(categories.data ?? []).map((category) => <option key={category.slug as string} value={category.slug as string}>{category.name as string}</option>)}
            </select>
          </label>
          <label>Size
            <select name="size" defaultValue={filters.sizeGroup ?? ""}>
              <option value="">Any</option>
              {sizeLabels.map((label) => <option key={label} value={label}>{label}</option>)}
            </select>
          </label>
          <label>Condition
            <select name="condition" defaultValue={filters.condition ?? ""}>
              <option value="">Any</option>
              {CONDITIONS.map((condition) => <option key={condition} value={condition}>{conditionLabel[condition]}</option>)}
            </select>
          </label>
          <label>Min N$
            <input name="min" type="number" inputMode="numeric" min={0} step={10} defaultValue={filters.minPrice ?? ""} placeholder="0" />
          </label>
          <label>Max N$
            <input name="max" type="number" inputMode="numeric" min={0} step={10} defaultValue={filters.maxPrice ?? ""} placeholder="Any" />
          </label>
          <label>Sort
            <select name="sort" defaultValue={filters.sort}>
              <option value="newest">Recently added</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
          <div className="filter-actions">
            <button className="button button-ink" type="submit">Apply</button>
            {hasFilters && <Link className="plain-button" href="/browse">Clear</Link>}
          </div>
        </form>

        {!configured ? (
          <div className="empty-state" role="status"><h3>Browsing is not set up yet.</h3><p>Listings will appear here once the marketplace is connected.</p></div>
        ) : !result ? (
          <div className="empty-state" role="status"><h3>Listings are unavailable right now.</h3><p>Please try again in a moment.</p></div>
        ) : result.listings.length === 0 ? (
          <div className="empty-state"><span>♡</span><h3>No pieces found just yet.</h3><p>Try fewer filters or a different search.</p>{hasFilters && <Link className="plain-button" href="/browse">Show everything</Link>}</div>
        ) : (
          <>
            <div className="listing-grid">
              {result.listings.map((listing) => <ListingCard key={listing.id} listing={listing} saved={saved.has(listing.id)} signedIn={signedIn} />)}
            </div>
            <nav className="pager" aria-label="Pagination">
              {filters.page > 1 && <Link className="button button-outline" href={pageHref(filters, filters.page - 1)} rel="prev">← Previous</Link>}
              <span>Page {filters.page}</span>
              {result.hasMore && <Link className="button button-outline" href={pageHref(filters, filters.page + 1)} rel="next">Next →</Link>}
            </nav>
          </>
        )}
      </section>
    </main>
  );
}
