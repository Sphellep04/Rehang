"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Marks everything as read once the list has been shown. Failure is harmless, so it is ignored. */
export function MarkRead({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    void createClient().rpc("mark_notifications_read");
  }, [hasUnread]);
  return null;
}
