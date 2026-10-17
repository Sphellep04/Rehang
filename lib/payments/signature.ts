import { createHmac, timingSafeEqual } from "node:crypto";

/** How far a signed message's timestamp may be from now, in seconds. Stops old messages being replayed. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Builds the header value "t=<unix seconds>,v1=<hex>". The signed text is "<t>.<raw body>". */
export function signPayload(secret: string, body: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${nowSeconds}.${body}`).digest("hex");
  return `t=${nowSeconds},v1=${mac}`;
}

/** True only when the header matches the body, was made with the secret, and is recent. */
export function verifySignature(secret: string, body: string, header: string | null, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const given = parts.v1;
  if (!Number.isInteger(t) || !given || !/^[0-9a-f]{64}$/.test(given)) return false;
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  const actual = Buffer.from(given, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
