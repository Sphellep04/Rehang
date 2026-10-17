import { z } from "zod";

/**
 * Only allow return paths inside this site, so a crafted link cannot send people elsewhere.
 * Browsers silently remove tabs and line breaks inside a URL, so "/\t/evil.com" would become "//evil.com".
 * Control characters and spaces are refused outright, and the path is parsed to confirm it stays on the same origin.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u0020\u007f-\u009f]/.test(value)) return fallback;
  try {
    const base = "https://rehang.invalid";
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return value;
}

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

/** Matches minimum_password_length and password_requirements in supabase/config.toml. */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(72, "Use 72 characters or fewer.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

/** Client-side: the login address that brings the person back to the page they are on. */
export function loginHref(): string {
  const here = `${window.location.pathname}${window.location.search}`;
  return here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}
