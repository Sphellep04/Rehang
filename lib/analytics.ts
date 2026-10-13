import { createClient } from "@/lib/supabase/client";

export type TrackedEvent = "share_clicked" | "pwa_installed" | "install_prompt_shown" | "shared_link_opened";
export type TrackProps = { channel?: string; object?: string; surface?: string };

/** Fire and forget. The database keeps only the allowed names and keys, and a failure never reaches the person. */
export function track(name: TrackedEvent, props: TrackProps = {}): void {
  try {
    void createClient().rpc("track_event", { p_name: name, p_props: props }).then(() => undefined, () => undefined);
  } catch {
    // Analytics must never break a page.
  }
}
