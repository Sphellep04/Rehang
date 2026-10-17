"use client";

import { useEffect, useState } from "react";
import { analyticsAllowed, setAnalyticsAllowed } from "@/lib/analytics";

/** Opt out of the anonymous counts Rehang keeps (shares, app installs, item views). Saved on this phone only. */
export function AnalyticsForm() {
  // The server cannot know this phone's choice, so start on and read the saved choice once the page is in the browser.
  const [allowed, setAllowed] = useState(true);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setAllowed(analyticsAllowed()), []);
  return (
    <div className="order-form">
      <h3>Anonymous usage counts</h3>
      <p className="trade-hint">Rehang counts things like how many people tap Share, install the app or look at an item, so sellers can see their numbers and we can see what works. Nothing in these counts is your name, messages or location. Switch off to stop your phone sending them. This applies to this phone or browser only.</p>
      <label className="check-row">
        <input type="checkbox" checked={allowed} onChange={(event) => { setAllowed(event.target.checked); setAnalyticsAllowed(event.target.checked); }} />
        <span>Send anonymous usage counts</span>
      </label>
    </div>
  );
}
