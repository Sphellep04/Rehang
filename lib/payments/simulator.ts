/** True only on staging or local runs that opt in with PAYMENTS_SIMULATOR=true. Never in production. */
export function simulatorAvailable(): boolean {
  return process.env.PAYMENTS_SIMULATOR === "true" && process.env.VERCEL_ENV !== "production";
}
