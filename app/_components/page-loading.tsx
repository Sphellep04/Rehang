export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <main>
      <div className="page-loading" role="status" aria-live="polite">{label}</div>
    </main>
  );
}
