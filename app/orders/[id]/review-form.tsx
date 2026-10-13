"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReviewForm({ orderId, revieweeId, revieweeName }: { orderId: string; revieweeId: string; revieweeName: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1) return setError("Choose a star rating.");
    setBusy(true);
    setError("");
    const { error: writeError } = await createClient().from("reviews").insert({
      order_id: orderId,
      reviewee_id: revieweeId,
      rating,
      comment: comment.trim() || null,
    });
    setBusy(false);
    if (writeError) {
      return setError(writeError.code === "23505" ? "You have already reviewed this order." : "We couldn't save your review. Reviews close 7 days after the sale.");
    }
    router.refresh();
  }

  return (
    <form className="order-form" onSubmit={(event) => void submit(event)}>
      <h3>How was {revieweeName}?</h3>
      <div className="star-picker" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} ${value === 1 ? "star" : "stars"}`} className={value <= rating ? "on" : ""} onClick={() => setRating(value)}>★</button>
        ))}
      </div>
      <label htmlFor="review-comment">Comment (optional)</label>
      <textarea id="review-comment" rows={3} maxLength={300} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Was the item as described? Was the meet-up easy?" />
      <button className="button button-coral" type="submit" disabled={busy}>{busy ? "Saving…" : "Post review"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  );
}
