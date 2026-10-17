import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Vercel sends "Authorization: Bearer $CRON_SECRET". Anything else is refused. */
export function cronAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 24) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
