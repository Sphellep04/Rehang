"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { userId: string; name: string; initialBlocked: boolean; signedIn: boolean };

export function BlockButton({ userId, name, initialBlocked, signedIn }: Props) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (!signedIn) return router.push("/login");
    if (!blocked && !window.confirm(`Block ${name}? You will no longer see each other's listings or messages.`)) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: writeError } = blocked
      ? await supabase.from("blocks").delete().eq("blocked_id", userId)
      : await supabase.from("blocks").upsert({ blocked_id: userId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
    setBusy(false);
    if (writeError) return setError("Could not update. Try again.");
    setBlocked(!blocked);
    router.refresh();
  }

  return (
    <>
      <button className="plain-button report-link" type="button" disabled={busy} onClick={() => void toggle()}>⊘ {blocked ? "Unblock" : "Block"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </>
  );
}
