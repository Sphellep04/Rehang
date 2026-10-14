import type { NextConfig } from "next";

// Where the browser may talk to. Supabase handles data, auth and photo storage.
function supabaseOrigins(): { http: string; ws: string } | null {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return { http: url.origin, ws: `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}` };
  } catch {
    return null;
  }
}

const supabase = supabaseOrigins();
const isDev = process.env.NODE_ENV !== "production";

// Next.js writes small inline scripts into every page, and a per-request nonce would force every page to render on
// demand (no prerendered shell). So scripts allow 'unsafe-inline' and everything else is locked down: no plugins,
// no framing, no foreign form targets, no foreign base tag, and connections only to this site and Supabase.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data:${supabase ? ` ${supabase.http}` : ""}`,
  "font-src 'self'",
  `connect-src 'self'${supabase ? ` ${supabase.http} ${supabase.ws}` : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera is allowed for taking listing and ID photos. Everything else a clothes marketplace does not need is off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must never be cached for long, or a bad version could be stuck on phones.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
      // Admin and account pages should never be stored by shared caches.
      { source: "/(admin|account|orders|inbox|offers|verify|my-listings)/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
