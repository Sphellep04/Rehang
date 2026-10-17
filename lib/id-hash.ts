import "server-only";

import { createHmac } from "node:crypto";

/** Keeps letters and digits only, in capitals, so "123-456 78901" and "12345678901" give the same hash. */
export function normaliseIdNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function isPlausibleIdNumber(value: string): boolean {
  return /^[A-Z0-9]{6,20}$/.test(value);
}

/**
 * One-way hash of an ID number. The secret pepper lives only on the server, so a stolen database
 * cannot be used to guess ID numbers by trying them all. Returns null if the pepper is missing.
 */
export function hashIdNumber(value: string): string | null {
  const pepper = process.env.ID_HASH_PEPPER;
  if (!pepper || pepper.length < 32) return null;
  return createHmac("sha256", pepper).update(normaliseIdNumber(value)).digest("hex");
}
