/** Public address of the site, without a trailing slash. Used for share links and Open Graph tags. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** The text sent with a shared item or shop. Plain, with no personal details. */
export function shareText(kind: "item" | "shop", title: string): string {
  return kind === "item" ? `Have a look at this on Rehang: ${title}` : `Have a look at ${title} on Rehang`;
}
