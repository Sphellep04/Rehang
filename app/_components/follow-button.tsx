"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginHref } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

type Props = { sellerId: string; sellerName: string; initialFollowing: boolean; signedIn: boolean };

export function FollowButton({ sellerId, sellerName, initialFollowing, signedIn }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!signedIn) {
      router.push(loginHref());
      return;
    }

    const next = !following;
    setFollowing(next);
    setError("");

    startTransition(async () => {
      const supabase = createClient();
      const { error: writeError } = next
        ? await supabase.from("follows").upsert({ seller_id: sellerId }, { onConflict: "follower_id,seller_id", ignoreDuplicates: true })
        : await supabase.from("follows").delete().eq("seller_id", sellerId);

      if (writeError) {
        setFollowing(!next);
        setError("Could not update. Try again.");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="follow-wrap">
      <button
        className={`button ${following ? "button-outline" : "button-ink"}`}
        type="button"
        aria-pressed={following}
        aria-label={following ? `Unfollow ${sellerName}` : `Follow ${sellerName}`}
        disabled={pending}
        onClick={toggle}
      >
        {following ? "Following" : "Follow"}
      </button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
