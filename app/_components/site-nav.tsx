"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "../login/actions";

type Props = {
  signedIn: boolean;
  /** Replaces the Saved link, used by the home page preview where saving is local. */
  savedControl?: ReactNode;
};

const accountLinks = [
  { href: "/dashboard", label: "Seller dashboard" },
  { href: "/my-listings", label: "My listings" },
  { href: "/inbox", label: "Messages" },
  { href: "/offers", label: "Offers" },
  { href: "/orders", label: "Orders" },
  { href: "/donate", label: "Give to a children's home" },
  { href: "/notifications", label: "Updates" },
  { href: "/account", label: "Account and settings" },
];

export function SiteNav({ signedIn, savedControl }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav className="site-nav" aria-label="Main navigation">
      <Link className="nav-link nav-browse" href="/browse">Browse</Link>
      {savedControl ?? <Link className="nav-link nav-saved" href={signedIn ? "/saved" : "/login?next=/saved"}><span aria-hidden="true">♡</span><span className="nav-label"> Saved</span></Link>}
      <Link className="button button-coral nav-sell" href="/sell">Sell<span className="nav-sell-long">an item</span><span aria-hidden="true">+</span></Link>

      {signedIn ? (
        <div className="account-menu" ref={box}>
          <button className="account-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span className="account-dot" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg></span>
            <span className="nav-label">Me</span>
            <span aria-hidden="true" className="account-caret">▾</span>
            <span className="sr-only">Open account menu</span>
          </button>
          {open && (
            <div className="account-panel" role="menu">
              {accountLinks.map((link) => (
                <Link key={link.href} href={link.href} role="menuitem" onClick={() => setOpen(false)}>{link.label}</Link>
              ))}
              <form action={signOut}><button type="submit" role="menuitem">Sign out</button></form>
            </div>
          )}
        </div>
      ) : (
        <div className="nav-auth">
          <Link className="nav-link" href="/login">Sign in</Link>
          <Link className="nav-link nav-create" href="/signup">Create account</Link>
        </div>
      )}
    </nav>
  );
}
