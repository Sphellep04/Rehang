"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Hint = { low_cents: number; middle_cents: number; high_cents: number; sample_size: number; same_brand: boolean };
const rand = (cents: number) => `N$${Math.round(cents / 100).toLocaleString("en-ZA")}`;

/** Shows what similar items have been priced at, once five or more exist. It is only a guide. The seller sets the price. */
export function PriceHint({ categoryId, condition, brand }: { categoryId: string; condition: string; brand: string }) {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    const category = Number(categoryId);
    if (!category || !condition) {
      // Nothing to look up until a category and condition are chosen.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHint(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await createClient().rpc("price_suggestion", { p_category: category, p_condition: condition, p_brand: brand.trim() || null });
        if (!cancelled) setHint(!error && Array.isArray(data) && data[0] ? (data[0] as Hint) : null);
      } catch {
        if (!cancelled) setHint(null);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [categoryId, condition, brand]);

  if (!hint) return null;
  return (
    <p className="trade-hint price-hint" role="status">
      Similar {hint.same_brand ? "items from this brand" : "items"} are usually priced between <b>{rand(hint.low_cents)}</b> and <b>{rand(hint.high_cents)}</b>, with a middle price of <b>{rand(hint.middle_cents)}</b> ({hint.sample_size} recent listings). It is only a guide. You choose your price.
    </p>
  );
}
