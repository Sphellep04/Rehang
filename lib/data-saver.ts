import "server-only";

import { cookies, headers } from "next/headers";
import { DATA_SAVER_COOKIE } from "./data-saver-shared";

/**
 * Data saver mode: lists show the small 320 pixel photos instead of the 720 pixel ones, and links stop prefetching.
 * Read at request time. A saved choice wins. Without one, a phone set to "Data Saver" (Save-Data: on) switches it on.
 */
export async function dataSaverOn(): Promise<boolean> {
  const saved = (await cookies()).get(DATA_SAVER_COOKIE)?.value;
  if (saved === "1") return true;
  if (saved === "0") return false;
  return (await headers()).get("save-data")?.toLowerCase() === "on";
}
