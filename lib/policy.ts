import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

export type PolicySlug = "terms-of-use" | "privacy-policy" | "seller-rules" | "buyer-protection" | "prohibited-items";

/** Where each policy file is shown on the site. Links between policies are rewritten to these. */
export const policyRoutes: Record<PolicySlug, string> = {
  "terms-of-use": "/terms",
  "privacy-policy": "/privacy",
  "seller-rules": "/seller-rules",
  "buyer-protection": "/buyer-protection",
  "prohibited-items": "/prohibited-items",
};

/**
 * Turns one of the policy files in docs/policies into safe HTML. These files are written by us and live in
 * the repository, never typed by visitors. Links to other policies point at their pages, and links to
 * internal documents (which are not on the site) become plain text.
 */
export function loadPolicy(slug: PolicySlug): { title: string; html: string } {
  const source = readFileSync(join(process.cwd(), "docs", "policies", `${slug}.md`), "utf8");
  const title = (source.match(/^#\s+(.+)$/m)?.[1] ?? "Policy").replace(/\s*\(draft\)\s*$/i, "");
  const body = source.replace(/^#\s+.+$/m, "").replace(/^>\s*\*\*Draft for lawyer review[^\n]*\n/m, "");
  let html = marked.parse(body, { async: false, gfm: true }) as string;
  html = html.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (_match, href: string, text: string) => {
    if (/^https?:\/\//.test(href)) return `<a href="${href}" rel="noopener noreferrer">${text}</a>`;
    const file = href.split("#")[0].replace(/^(\.\.?\/)+/, "").replace(/\.md$/, "");
    if (file in policyRoutes) return `<a href="${policyRoutes[file as PolicySlug]}${href.includes("#") ? `#${href.split("#")[1]}` : ""}">${text}</a>`;
    return text;
  });
  return { title, html };
}
