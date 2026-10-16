import { createClient } from "@/lib/supabase/client";

export type TrackedEvent = "share_clicked" | "pwa_installed" | "install_prompt_shown" | "shared_link_opened";
export type TrackProps = { channel?: string; object?: string; surface?: string };

/** Fire and forget. The database keeps only the allowed names and keys, and a failure never reaches the person. */
const OPT_OUT_KEY = "rehang-no-analytics";

/** The choice is kept on this phone only. When it is off, nothing is sent: no share counts, no install counts, no item view counts. */
export function analyticsAllowed(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setAnalyticsAllowed(allowed: boolean): void {
  try {
    if (allowed) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, "1");
  } catch {
    // Storage is blocked, so there is nothing to remember.
  }
}

export function track(name: TrackedEvent, props: TrackProps = {}): void {
  if (!analyticsAllowed()) return;
  try {
    void createClient().rpc("track_event", { p_name: name, p_props: props }).then(() => undefined, () => undefined);
  } catch {
    // Analytics must never break a page.
  }
}
