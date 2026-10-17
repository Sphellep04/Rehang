"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DATA_SAVER_COOKIE } from "@/lib/data-saver-shared";

/** Saves the choice in a cookie on this phone, so it works before sign-in too. Nothing is stored on the server. */
export function DataSaverForm({ initiallyOn }: { initiallyOn: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initiallyOn);

  function change(next: boolean) {
    setOn(next);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${DATA_SAVER_COOKIE}=${next ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    router.refresh();
  }

  return (
    <div className="order-form">
      <h3>Data saver</h3>
      <p className="trade-hint">Shows small photos in lists and stops pages loading in the background. The photos are smaller, roughly half the size, so browsing costs less data. Item pages still show the full photo. This applies to this phone or browser only.</p>
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={(event) => change(event.target.checked)} />
        <span>Use data saver</span>
      </label>
    </div>
  );
}
