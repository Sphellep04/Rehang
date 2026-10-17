/** The one shape every payment partner's adapter turns its own messages into. */
export type PaymentEvent = {
  provider: string;
  reference: string;
  orderId: string;
  kind: "authorization" | "capture";
  status: "pending" | "succeeded" | "failed" | "reversed";
  amountCents: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = ["authorization", "capture"] as const;
const statuses = ["pending", "succeeded", "failed", "reversed"] as const;

/** Checks a parsed message. Returns null for anything malformed, so nothing odd reaches the database. */
export function parsePaymentEvent(raw: unknown): PaymentEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const { provider, reference, order_id: orderId, kind, status, amount_cents: amount } = v;
  if (typeof provider !== "string" || !/^[a-z0-9_-]{2,30}$/.test(provider)) return null;
  if (typeof reference !== "string" || reference.length < 3 || reference.length > 120) return null;
  if (typeof orderId !== "string" || !uuid.test(orderId)) return null;
  if (!kinds.includes(kind as (typeof kinds)[number]) || !statuses.includes(status as (typeof statuses)[number])) return null;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0 || amount > 100_000_000) return null;
  return { provider, reference, orderId, kind: kind as PaymentEvent["kind"], status: status as PaymentEvent["status"], amountCents: amount };
}
