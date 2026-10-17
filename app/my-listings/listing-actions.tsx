"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

type Props = {
  itemId: string;
  status: string;
  canRelist: boolean;
};

export function ListingActions({ itemId, status, canRelist }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(name: "publish_item" | "mark_item_sold" | "remove_my_item" | "relist_item", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error: rpcError } = await createClient().rpc(name, { p_item: itemId });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    if (data === "awaiting_verification") setNotice("Saved. It goes live once your ID is verified.");
    router.refresh();
  }

  const editable = status === "draft" || status === "awaiting_verification" || status === "active";

  return (
    <div className="offer-actions">
      <div className="offer-buttons">
        {status === "draft" && <button className="button button-coral" type="button" disabled={busy} onClick={() => void run("publish_item")}>Publish</button>}
        {status === "active" && <button className="button button-outline" type="button" disabled={busy} onClick={() => void run("mark_item_sold", "Mark this as sold? Use this if you sold it outside Rehang.")}>Mark sold</button>}
        {canRelist && <button className="button button-outline" type="button" disabled={busy} onClick={() => void run("relist_item")}>Relist</button>}
        {editable && <Link className="plain-button" href={`/my-listings/${itemId}`}>Edit</Link>}
        {editable && <button className="plain-button" type="button" disabled={busy} onClick={() => void run("remove_my_item", "Remove this listing? You can relist it later.")}>Remove</button>}
        {status === "reserved" && <Link className="plain-button" href="/orders">Open order</Link>}
        {status === "awaiting_verification" && <Link className="plain-button" href="/verify">Verify ID</Link>}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="trade-success" role="status">{notice}</p>}
    </div>
  );
}
