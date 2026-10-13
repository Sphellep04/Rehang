import { z } from "zod";

/** Only allow return paths inside this site, so a crafted link cannot send people elsewhere. */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
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
