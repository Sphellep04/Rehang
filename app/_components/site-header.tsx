import Link from "next/link";

export function HangerMark() {
  return (
    <svg aria-hidden="true" className="hanger-mark" viewBox="0 0 36 28">
      <path d="M17.5 4.5a3 3 0 1 1 3 3c-1 0-1.7.7-1.7 1.6v2.2L32 19.1c1.5 1 .8 3.1-1 3.1H5c-1.8 0-2.5-2.1-1-3.1l14.8-9.5" />
    </svg>
  );
}

export function SiteHeader({ signedIn, query = "" }: { signedIn: boolean; query?: string }) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/"><HangerMark />rehang<span className="coral">.</span></Link>
      <span className="location"><i /> Windhoek, Namibia</span>
      <form className="search-box" action="/browse" role="search">
        <span aria-hidden="true">⌕</span>
        <label className="sr-only" htmlFor="site-search">Search listings</label>
        <input id="site-search" name="q" type="search" defaultValue={query} maxLength={80} placeholder="Search clothes, brands, sizes..." />
      </form>
      <nav className="header-actions" aria-label="Main navigation">
        <Link className="plain-button" href="/browse">Browse</Link>
        <Link className="plain-button" href={signedIn ? "/saved" : "/login"}>♡ Saved</Link>
        {signedIn ? <Link className="plain-button" href="/inbox">Messages</Link> : <Link className="plain-button" href="/login">Sign in</Link>}
        <Link className="button button-coral" href="/sell">Sell an item <span>+</span></Link>
      </nav>
    </header>
  );
}
