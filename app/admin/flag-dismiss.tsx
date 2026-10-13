"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

export function FlagDismiss({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function dismiss() {
    setBusy(true);
    const { error: rpcError } = await createClient().rpc("resolve_item_flag", { p_flag: id });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    router.refresh();
  }
  return (
    <div className="admin-actions">
      <button className="button button-outline" type="button" disabled={busy} onClick={() => void dismiss()}>Looks fine, dismiss</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
