"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { analyticsAllowed } from "@/lib/analytics";

/** Counts one view of an item per browser tab session. Nothing about the viewer is sent or stored. */
export function ViewCounter({ itemId }: { itemId: string }) {
  useEffect(() => {
    if (!analyticsAllowed()) return;
    const key = `rehang-viewed-${itemId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage can be blocked. Count the view anyway.
    }
    try {
      void createClient().rpc("record_item_view", { p_item: itemId }).then(() => undefined, () => undefined);
    } catch {
      // Counting must never break the page.
    }
  }, [itemId]);
  return null;
}
