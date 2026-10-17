"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

type Item = { id: string; title: string; price: number; image: string; size: string };

export function BundleBuilder({ items, minimum, percent, signedIn, handle }: { items: Item[]; minimum: number; percent: number; signedIn: boolean; handle: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (items.length < minimum) return <p className="trade-hint">This seller needs at least {minimum} items on sale before you can bundle.</p>;

  const total = items.filter((i) => picked.includes(i.id)).reduce((sum, i) => sum + i.price, 0);
  const saving = Math.floor((total * percent) / 100);
  const ready = picked.length >= minimum && picked.length <= 10;

  function toggle(id: string) {
    setPicked((current) => current.includes(id) ? current.filter((x) => x !== id) : current.length >= 10 ? current : [...current, id]);
  }

  async function buy() {
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(`/bundle/${handle}`)}`);
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await createClient().rpc("create_bundle", { p_items: picked });
    setBusy(false);
    if (rpcError || !data) return setError(tradeError(rpcError?.message));
    router.push(`/orders/${data}`);
  }

  return (
    <div>
      <ul className="list-cards">
        {items.map((item) => (
          <li className="list-card" key={item.id}>
            <label className="list-card-main" style={{ display: "flex", gap: "0.75rem", alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={picked.includes(item.id)} onChange={() => toggle(item.id)} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {item.image && <img src={item.image} alt="" width={48} height={58} style={{ objectFit: "cover", borderRadius: 6 }} />}
              <span><b>{item.title}</b><br /><small>Size {item.size} · N${item.price.toLocaleString("en-ZA")}</small></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="order-form" aria-live="polite">
        <p><b>{picked.length}</b> selected{picked.length < minimum ? ` (choose at least ${minimum})` : ""}</p>
        {picked.length > 0 && <p>Items N${total.toLocaleString("en-ZA")} · {ready ? <>you save N${saving.toLocaleString("en-ZA")} · <b>total N${(total - saving).toLocaleString("en-ZA")}</b></> : "discount applies from " + minimum + " items"}</p>}
        <button className="button button-coral" type="button" disabled={!ready || busy} onClick={() => void buy()}>{busy ? "Reserving…" : "Buy this bundle"}</button>
        <p className="trade-hint">You pay the seller in person at the meet-up. The seller confirms the time and place.</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
