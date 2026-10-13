"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  itemId: string;
  title: string;
  initialSaved: boolean;
  signedIn: boolean;
  className?: string;
};

export function SaveButton({ itemId, title, initialSaved, signedIn, className = "save-button" }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!signedIn) {
      router.push("/login");
      return;
    }

    const next = !saved;
    setSaved(next);
    setError("");

    startTransition(async () => {
      const supabase = createClient();
      const { error: writeError } = next
        ? await supabase.from("favourites").upsert({ item_id: itemId }, { onConflict: "user_id,item_id", ignoreDuplicates: true })
        : await supabase.from("favourites").delete().eq("item_id", itemId);

      if (writeError) {
        setSaved(!next);
        setError("Could not update saved items. Try again.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        className={`${className} ${saved ? "is-saved" : ""}`}
        type="button"
        aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
        aria-pressed={saved}
        disabled={pending}
        onClick={toggle}
      >
        {saved ? "♥" : "♡"}
      </button>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </>
  );
}
