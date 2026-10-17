export function Stars({ value, count, label }: { value: number | null; count: number; label?: string }) {
  if (!count || value === null) return <span className="stars stars-empty">{label ?? "No reviews yet"}</span>;
  const full = Math.round(value);
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} out of 5 from ${count} ${count === 1 ? "review" : "reviews"}`}>
      <span aria-hidden="true">{"★".repeat(full)}{"☆".repeat(5 - full)}</span> <b>{value.toFixed(1)}</b> <small>({count})</small>
    </span>
  );
}
