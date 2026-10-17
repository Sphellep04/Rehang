"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginHref } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

type Props = { itemId: string; sellerId: string };

export function MessageSellerButton({ itemId, sellerId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(loginHref());
        return;
      }

      const findExisting = () =>
        supabase.from("conversations").select("id").eq("item_id", itemId).eq("buyer_id", user.id).maybeSingle();

      const { data: existing, error: lookupError } = await findExisting();
      if (lookupError) {
        setError("Could not open this conversation right now.");
        return;
      }
      if (existing) {
        router.push(`/inbox/${existing.id}`);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from("conversations")
        .insert({ item_id: itemId, seller_id: sellerId })
        .select("id")
        .single();

      if (createError?.code === "23505") {
        const { data: raced } = await findExisting();
        if (raced) {
          router.push(`/inbox/${raced.id}`);
          return;
        }
      }
      if (createError || !created) {
        setError("Could not start this conversation. The seller may be unavailable.");
        return;
      }
      router.push(`/inbox/${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="follow-wrap">
      <button className="button button-ink" type="button" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening conversation…" : "Message seller"}
      </button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
