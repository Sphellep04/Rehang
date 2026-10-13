"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

/** Counts a visit that arrived through a shared link (?ref=share) and records app installs. Renders nothing. */
export function SiteSignals() {
  const params = useSearchParams();
  const fromShare = params.get("ref") === "share";
  useEffect(() => {
    if (!fromShare) return;
    try {
      if (sessionStorage.getItem("rehang-share-seen")) return;
      sessionStorage.setItem("rehang-share-seen", "1");
    } catch {
      // Storage can be blocked. Count the visit anyway.
    }
    track("shared_link_opened", { surface: "web" });
  }, [fromShare]);
  useEffect(() => {
    const installed = () => track("pwa_installed", { surface: "web" });
    window.addEventListener("appinstalled", installed);
    return () => window.removeEventListener("appinstalled", installed);
  }, []);
  return null;
}
