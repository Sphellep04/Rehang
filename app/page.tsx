"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Listing = {
  id: string;
  title: string;
  category: string;
  size: string;
  condition: string;
  price: number;
  image: string;
  sellerId: string;
  seller: string;
  verified: boolean;
  trusted: boolean;
  isExample: boolean;
};

const exampleListings: Listing[] = [
  { id: "example-1", title: "Soft knit cardigan", category: "Tops", size: "M", condition: "Very good", price: 280, image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=720&q=78", sellerId: "", seller: "", verified: false, trusted: false, isExample: true },
  { id: "example-2", title: "Everyday denim jacket", category: "Jackets", size: "L", condition: "Good", price: 420, image: "https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=720&q=78", sellerId: "", seller: "", verified: false, trusted: false, isExample: true },
  { id: "example-3", title: "Linen day dress", category: "Dresses", size: "S", condition: "New without tags", price: 360, image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=720&q=78", sellerId: "", seller: "", verified: false, trusted: false, isExample: true },
  { id: "example-4", title: "Shoulder bag", category: "Bags", size: "One size", condition: "Very good", price: 310, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=720&q=78", sellerId: "", seller: "", verified: false, trusted: false, isExample: true },
  { id: "example-5", title: "Straight-leg trousers", category: "Bottoms", size: "UK 12", condition: "Good", price: 240, image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=720&q=78", sellerId: "", seller: "", verified: false, trusted: false, isExample: true },
  { id: "example-6", title: "Canvas low-top sneakers", category: "Shoes", size: "UK 6", condition: "Very good", price: 290, image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=720&q=78", sellerId: "", seller: "", verified: false, trusted: false, isExample: true },
];

type CatalogStatus = "loading" | "examples" | "live" | "unavailable";

function HangerMark() {
  return (
    <svg aria-hidden="true" className="hanger-mark" viewBox="0 0 36 28">
      <path d="M17.5 4.5a3 3 0 1 1 3 3c-1 0-1.7.7-1.7 1.6v2.2L32 19.1c1.5 1 .8 3.1-1 3.1H5c-1.8 0-2.5-2.1-1-3.1l14.8-9.5" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All pieces");
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [notice, setNotice] = useState("");
  const [openingConversation, setOpeningConversation] = useState(false);

  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setIsSignedIn(Boolean(data.user));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadListings() {
      try {
        const response = await fetch("/api/listings", { cache: "no-store" });
        if (!response.ok) {
          setCatalogStatus("unavailable");
          return;
        }

        const result: { source: "examples" | "live"; listings: Listing[] | null } = await response.json();
        if (cancelled) return;

        if (result.source === "examples") {
          setListings(exampleListings);
          setCatalogStatus("examples");
          return;
        }

        if (result.source !== "live" || !result.listings) {
          setCatalogStatus("unavailable");
          return;
        }

        setListings(result.listings);
        setCatalogStatus("live");
      } catch {
        if (!cancelled) setCatalogStatus("unavailable");
      }
    }

    void loadListings();
    return () => { cancelled = true; };
  }, []);

  const isLiveCatalog = catalogStatus === "live";

  useEffect(() => {
    if (catalogStatus !== "live" || !isSignedIn || listings.length === 0) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("favourites")
      .select("item_id")
      .in("item_id", listings.map((item) => item.id))
      .then(({ data }) => {
        if (!cancelled && data) setSaved(data.map((row) => row.item_id as string));
      });
    return () => { cancelled = true; };
  }, [catalogStatus, isSignedIn, listings]);
  const isExampleCatalog = catalogStatus === "examples";
  const categories = ["All pieces", ...new Set(listings.map((item) => item.category))];

  const visible = listings
    .filter((item) => category === "All pieces" || item.category === category)
    .filter((item) => !savedOnly || saved.includes(item.id))
    .filter((item) => `${item.title} ${item.category} ${item.size} ${item.seller}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((first, second) => sort === "price-low" ? first.price - second.price : 0);

  async function toggleSaved(item: Listing) {
    const id = item.id;
    const next = !saved.includes(id);
    const apply = (on: boolean) => setSaved((current) => on ? [...new Set([...current, id])] : current.filter((value) => value !== id));

    if (item.isExample || !isLiveCatalog) {
      apply(next);
      return;
    }
    if (!isSignedIn) {
      router.push("/login");
      return;
    }

    apply(next);
    const supabase = createClient();
    const { error } = next
      ? await supabase.from("favourites").upsert({ item_id: id }, { onConflict: "user_id,item_id", ignoreDuplicates: true })
      : await supabase.from("favourites").delete().eq("item_id", id);
    if (error) {
      apply(!next);
      showNotice("Could not update your saved items.");
    }
  }

  function openItem(item: Listing) {
    if (item.isExample) setSelected(item);
    else router.push(`/item/${item.id}`);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  async function messageSeller(item: Listing) {
    if (item.isExample || !item.sellerId || openingConversation) return;
    setOpeningConversation(true);

    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.push("/login");
        return;
      }
      if (user.id === item.sellerId) {
        showNotice("This is your listing.");
        return;
      }

      const findExistingConversation = () => supabase
        .from("conversations")
        .select("id")
        .eq("item_id", item.id)
        .eq("buyer_id", user.id)
        .maybeSingle();
      const { data: existing, error: lookupError } = await findExistingConversation();

      if (lookupError) {
        showNotice("Could not open this conversation right now.");
        return;
      }
      if (existing) {
        router.push(`/inbox/${existing.id}`);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({ item_id: item.id, seller_id: item.sellerId })
        .select("id")
        .single();

      if (createError?.code === "23505") {
        const { data: raced } = await findExistingConversation();
        if (raced) {
          router.push(`/inbox/${raced.id}`);
          return;
        }
      }
      if (createError || !created) {
        showNotice("Could not start this conversation. The seller may be unavailable.");
        return;
      }
      router.push(`/inbox/${created.id}`);
    } finally {
      setOpeningConversation(false);
    }
  }

  return (
    <main>
      <div className="pilot-strip"><b>WINDHOEK</b><span>Rehang preview</span></div>
      <header className="site-header">
        <a className="wordmark" href="#top"><HangerMark />rehang<span className="coral">.</span></a>
        <span className="location"><i /> Windhoek, Namibia</span>
        <form className="search-box" role="search" onSubmit={(event) => { event.preventDefault(); if (isLiveCatalog) router.push(query.trim() ? `/browse?q=${encodeURIComponent(query.trim())}` : "/browse"); }}><span aria-hidden="true">⌕</span><label className="sr-only" htmlFor="home-search">Search listings</label><input id="home-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clothes, brands, sizes..." /></form>
        <nav className="header-actions" aria-label="Main navigation">
          {isLiveCatalog
            ? <Link className="saved-link" href={isSignedIn ? "/saved" : "/login"}>♡ Saved</Link>
            : <button className="saved-link" type="button" onClick={() => setSavedOnly((value) => !value)}>♡ Saved{saved.length > 0 && <b>{saved.length}</b>}</button>}
          {isSignedIn ? <Link className="plain-button" href="/inbox">Messages</Link> : <Link className="plain-button" href="/login">Sign in</Link>}
          <Link className="button button-coral" href="/sell">Sell an item <span>+</span></Link>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">SECOND-HAND CLOTHES · WINDHOEK</p>
          <h1>Clothes for another <em>round.</em></h1>
          <p className="hero-description">{isLiveCatalog ? "Browse second-hand clothes listed by sellers in Windhoek." : "Rehang will connect local buyers and sellers of second-hand clothes."}</p>
          <div className="hero-actions"><a className="button button-ink" href="#shop">{isLiveCatalog ? "Browse listings" : "See example listings"} <span>↓</span></a><Link className="button button-outline" href="/login">Sign in</Link></div>
          <p className="hero-proof">Windhoek first <i /> Prices in N$ <i /> {isLiveCatalog ? "Local listings" : isExampleCatalog ? "Sample items only" : "Local marketplace"}</p>
        </div>
        <div className="hero-photo">
          <Image
            src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1250&q=82"
            alt="Woman wearing a relaxed everyday fashion look"
            fill
            sizes="(max-width: 760px) 100vw, 55vw"
            priority
            unoptimized
          />
          <span className="hero-image-caption">Style inspiration · not a listing</span>
        </div>
      </section>

      <section className="shop-section" id="shop">
        <div className="section-heading"><div><p className="eyebrow">WINDHOEK CATALOG {isExampleCatalog && <span className="sample-tag">EXAMPLES</span>}</p><h2>Browse by <em>category.</em></h2></div><p>{isLiveCatalog ? "Listings from local sellers." : isExampleCatalog ? "Example photos and prices, not live listings." : "Browse local second-hand clothes."}</p></div>
        <div className="shop-controls">
          <div className="category-tabs" role="group" aria-label="Filter by category">
            {categories.map((item) => <button className={category === item ? "active" : ""} key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          <label className="sort-control">Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Recently added</option><option value="price-low">Price: low to high</option></select></label>
        </div>
        <div className="results-line"><span>{savedOnly ? "YOUR SAVED PIECES" : isLiveCatalog ? "AVAILABLE IN WINDHOEK" : isExampleCatalog ? "EXAMPLE ITEMS" : "LISTINGS"}</span><span>{visible.length} {visible.length === 1 ? "piece" : "pieces"}</span></div>

        {catalogStatus === "loading" ? <div className="empty-state" role="status"><h3>Loading listings…</h3></div> : catalogStatus === "unavailable" ? <div className="empty-state" role="status"><h3>Listings are unavailable right now.</h3><p>Please try again in a moment.</p></div> : visible.length ? <div className="listing-grid">{visible.map((item) => (
          <article className="listing" key={item.id}>
            <button className="listing-image" type="button" onClick={() => openItem(item)} aria-label={`View ${item.title}`}>
              {item.image && <Image src={item.image} alt={item.title} width={720} height={870} sizes="(max-width: 760px) 50vw, 28vw" loading="lazy" unoptimized />}
              <span className="condition-tag">{item.condition}</span>
            </button>
            <button className={`save-button ${saved.includes(item.id) ? "is-saved" : ""}`} type="button" aria-label={saved.includes(item.id) ? `Unsave ${item.title}` : `Save ${item.title}`} aria-pressed={saved.includes(item.id)} onClick={() => void toggleSaved(item)}>{saved.includes(item.id) ? "♥" : "♡"}</button>
            <button className="listing-info" type="button" onClick={() => openItem(item)}>
              <span className="listing-title-row"><span>{item.title}</span><b>{item.isExample ? "Example · " : ""}N${item.price}</b></span>
              <span className="listing-meta">Size {item.size} <i /> {item.category}</span>
              {!item.isExample && <span className="seller-line">{item.verified ? "Verified seller" : "Seller"}: {item.seller}{item.trusted ? " · Trusted" : ""}</span>}
            </button>
          </article>
        ))}</div> : <div className="empty-state"><span>♡</span><h3>{savedOnly ? "Your saved pieces will live here." : "No pieces found just yet."}</h3><p>{savedOnly ? "Tap the heart on a listing to keep it close." : "Try another search or choose a different category."}</p><button type="button" onClick={() => { setCategory("All pieces"); setQuery(""); setSavedOnly(false); }}>Show all pieces</button></div>}
      </section>

      <section className="seller-band" id="sell"><div><p className="eyebrow">SELLING IN WINDHOEK</p><h2>Want to list your clothes?</h2></div><Link className="button button-paper" href="/sell">Start a listing <span>↗</span></Link></section>
      <footer className="site-footer"><a className="wordmark" href="#top"><HangerMark />rehang<span className="coral">.</span></a><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-title">
            <button className="modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close listing">×</button>
            {selected.image && <Image src={selected.image} alt={selected.title} width={900} height={1080} sizes="(max-width: 760px) 100vw, 390px" unoptimized />}
            <div className="modal-content">
              <p className="eyebrow">{selected.category} · SIZE {selected.size}</p>
              <h2 id="listing-title">{selected.title}</h2>
              <b className="modal-price">{selected.isExample ? "Example price: " : ""}N${selected.price}</b>
              <p className="modal-condition">{selected.condition} condition · {selected.isExample ? "Example only" : "Windhoek"}</p>
              {!selected.isExample && <div className="modal-seller"><span>{selected.seller.charAt(0)}</span><p><b>{selected.seller}</b><small>{selected.verified ? "Verified seller" : "Seller"}{selected.trusted ? " · Trusted" : ""}</small></p></div>}
              <p className="modal-note">{selected.isExample ? "This is a demonstration item, not an item for sale." : "Keep this conversation in Rehang. Personal phone numbers stay private."}</p>
              {selected.isExample
                ? <button className="button button-ink" type="button" onClick={() => setSelected(null)}>Close preview</button>
                : <button className="button button-ink" type="button" disabled={openingConversation} onClick={() => void messageSeller(selected)}>{openingConversation ? "Opening conversation…" : "Message seller"}</button>}
            </div>
          </section>
        </div>
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
