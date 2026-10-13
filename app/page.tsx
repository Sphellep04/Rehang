"use client";

import { useState } from "react";
import Image from "next/image";

type Listing = {
  id: number;
  title: string;
  category: string;
  size: string;
  condition: string;
  price: number;
  seller: string;
  image: string;
};

const listings: Listing[] = [
  { id: 1, title: "Soft knit cardigan", category: "Tops", size: "M", condition: "Very good", price: 280, seller: "Ndeshi K.", image: "photo-1434389677669-e08b4cac3105" },
  { id: 2, title: "Everyday denim jacket", category: "Jackets", size: "L", condition: "Good", price: 420, seller: "Tuli Amutenya", image: "photo-1543076447-215ad9ba6923" },
  { id: 3, title: "Linen day dress", category: "Dresses", size: "S", condition: "New without tags", price: 360, seller: "Martha I.", image: "photo-1539008835657-9e8e9680c956" },
  { id: 4, title: "Shoulder bag", category: "Bags", size: "One size", condition: "Very good", price: 310, seller: "Selma U.", image: "photo-1584917865442-de89df76afd3" },
  { id: 5, title: "Straight-leg trousers", category: "Bottoms", size: "UK 12", condition: "Good", price: 240, seller: "Ndapewa M.", image: "photo-1594633312681-425c7b97ccd1" },
  { id: 6, title: "Canvas low-top sneakers", category: "Shoes", size: "UK 6", condition: "Very good", price: 290, seller: "Anna N.", image: "photo-1525966222134-fcfa99b8ae77" },
];

const categories = ["All pieces", "Tops", "Dresses", "Jackets", "Bottoms", "Bags", "Shoes"];

function HangerMark() {
  return (
    <svg aria-hidden="true" className="hanger-mark" viewBox="0 0 36 28">
      <path d="M17.5 4.5a3 3 0 1 1 3 3c-1 0-1.7.7-1.7 1.6v2.2L32 19.1c1.5 1 .8 3.1-1 3.1H5c-1.8 0-2.5-2.1-1-3.1l14.8-9.5" />
    </svg>
  );
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All pieces");
  const [saved, setSaved] = useState<number[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [notice, setNotice] = useState("");

  const visible = listings
    .filter((item) => category === "All pieces" || item.category === category)
    .filter((item) => !savedOnly || saved.includes(item.id))
    .filter((item) => `${item.title} ${item.category} ${item.size} ${item.seller}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((first, second) => sort === "price-low" ? first.price - second.price : first.id - second.id);

  function toggleSaved(id: number) {
    setSaved((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  return (
    <main>
      <div className="pilot-strip"><b>WINDHOEK PILOT PREVIEW</b><span>Meet locally. Buy with confidence.</span></div>
      <header className="site-header">
        <a className="wordmark" href="#top"><HangerMark />rehang<span className="coral">.</span></a>
        <span className="location"><i /> Windhoek, Namibia</span>
        <label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Search listings</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clothes, brands, sizes..." /></label>
        <nav className="header-actions" aria-label="Main navigation">
          <button className="saved-link" type="button" onClick={() => setSavedOnly((value) => !value)}>♡ Saved{saved.length > 0 && <b>{saved.length}</b>}</button>
          <button className="plain-button" type="button" onClick={() => showNotice("Sign in will be available when accounts are connected.")}>Sign in</button>
          <a className="button button-coral" href="#sell">Sell an item <span>+</span></a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><i /> GOOD CLOTHES, SECOND ROUNDS</p>
          <h1>Find your next <em>favourite.</em></h1>
          <p className="hero-description">Pre-loved pieces from people nearby. Every seller is verified, so you can browse with a little more peace of mind.</p>
          <div className="hero-actions"><a className="button button-ink" href="#shop">Browse the pieces <span>↓</span></a><a className="button button-outline" href="#sell">Clear your closet <span>↗</span></a></div>
          <p className="hero-proof"><b>✓</b> Verified sellers <i /> Local meet-ups <i /> Prices in N$</p>
        </div>
        <div className="hero-photo">
          <Image src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1250&q=82" alt="A woman wearing a considered everyday outfit" fill sizes="(max-width: 760px) 100vw, 55vw" priority unoptimized />
          <span className="hero-stamp">✳<br />Good finds<br />live close by.</span>
          <span className="photo-location"><i /> Windhoek, Namibia</span>
        </div>
      </section>

      <section className="shop-section" id="shop">
        <div className="section-heading"><div><p className="eyebrow">THE WINDHOEK EDIT <span className="sample-tag">SAMPLE LISTINGS</span></p><h2>Good things, <em>found.</em></h2></div><p>A small preview of what Rehang is being built for.</p></div>
        <div className="shop-controls">
          <div className="category-tabs" role="group" aria-label="Filter by category">
            {categories.map((item) => <button className={category === item ? "active" : ""} key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          <label className="sort-control">Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Recently added</option><option value="price-low">Price: low to high</option></select></label>
        </div>
        <div className="results-line"><span>{savedOnly ? "YOUR SAVED PIECES" : "PRE-LOVED IN WINDHOEK"}</span><span>{visible.length} {visible.length === 1 ? "piece" : "pieces"}</span></div>

        {visible.length ? <div className="listing-grid">{visible.map((item) => (
          <article className="listing" key={item.id}>
            <button className="listing-image" type="button" onClick={() => setSelected(item)} aria-label={`View ${item.title}`}>
              <Image src={`https://images.unsplash.com/${item.image}?auto=format&fit=crop&w=720&q=78`} alt={item.title} width={720} height={870} sizes="(max-width: 760px) 50vw, 28vw" loading="lazy" unoptimized />
              <span className="condition-tag">{item.condition}</span>
            </button>
            <button className={`save-button ${saved.includes(item.id) ? "is-saved" : ""}`} type="button" aria-label={saved.includes(item.id) ? `Unsave ${item.title}` : `Save ${item.title}`} aria-pressed={saved.includes(item.id)} onClick={() => toggleSaved(item.id)}>{saved.includes(item.id) ? "♥" : "♡"}</button>
            <button className="listing-info" type="button" onClick={() => setSelected(item)}>
              <span className="listing-title-row"><span>{item.title}</span><b>N${item.price}</b></span>
              <span className="listing-meta">Size {item.size} <i /> {item.category}</span>
              <span className="seller-line"><b>✓</b> {item.seller}<small>Windhoek</small></span>
            </button>
          </article>
        ))}</div> : <div className="empty-state"><span>♡</span><h3>{savedOnly ? "Your saved pieces will live here." : "No pieces found just yet."}</h3><p>{savedOnly ? "Tap the heart on a listing to keep it close." : "Try another search or choose a different category."}</p><button type="button" onClick={() => { setCategory("All pieces"); setQuery(""); setSavedOnly(false); }}>Show all pieces</button></div>}
      </section>

      <section className="seller-band" id="sell"><span className="seller-mark"><HangerMark /></span><div><p className="eyebrow">YOUR CLOSET HAS GOOD STORIES</p><h2>Ready to hang it again?</h2></div><button className="button button-paper" type="button" onClick={() => showNotice("Seller onboarding is coming in the next build step.")}>I have things to sell <span>↗</span></button></section>
      <footer className="site-footer"><a className="wordmark" href="#top"><HangerMark />rehang<span className="coral">.</span></a><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-title"><button className="modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close listing">×</button><Image src={`https://images.unsplash.com/${selected.image}?auto=format&fit=crop&w=900&q=80`} alt={selected.title} width={900} height={1080} sizes="(max-width: 760px) 100vw, 390px" unoptimized /><div className="modal-content"><p className="eyebrow">{selected.category} · SIZE {selected.size}</p><h2 id="listing-title">{selected.title}</h2><b className="modal-price">N${selected.price}</b><p className="modal-condition">{selected.condition} condition · Windhoek</p><div className="modal-seller"><span>{selected.seller.charAt(0)}</span><p><b>{selected.seller}</b><small>✓ Verified seller</small></p></div><p className="modal-note">This is a sample listing in the Rehang preview. Live listings and messaging will be connected as the marketplace is built.</p><button className="button button-ink" type="button" onClick={() => { setSelected(null); showNotice("Messaging will be available when accounts are connected."); }}>Message seller <span>↗</span></button></div></section></div>}
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
