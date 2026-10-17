import { connection, NextResponse, type NextRequest } from "next/server";
import { parsePaymentEvent } from "@/lib/payments/events";
import { verifySignature } from "@/lib/payments/signature";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Receives payment results from the payment partner. Today this speaks Rehang's own neutral format,
 * signed with PAYMENT_WEBHOOK_SECRET. When a partner is chosen, a small adapter turns the partner's
 * message into the same shape before it reaches record_payment. Nothing here moves money.
 */
export async function POST(request: NextRequest) {
  await connection();
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const admin = createAdminClient();
  if (!secret || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = await request.text();
  if (body.length > 10_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifySignature(secret, body, request.headers.get("x-rehang-signature"))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const event = parsePaymentEvent(parsed);
  if (!event) return NextResponse.json({ error: "bad_event" }, { status: 400 });

  const { data, error } = await admin.rpc("record_payment", {
    p_order: event.orderId,
    p_provider: event.provider,
    p_reference: event.reference,
    p_kind: event.kind,
    p_status: event.status,
    p_amount_cents: event.amountCents,
  });
  if (error) {
    // payments_off is a clear "not now"; anything else is a fault the partner should retry.
    const off = error.message.includes("payments_off");
    return NextResponse.json({ error: off ? "payments_off" : "record_failed" }, { status: off ? 503 : 502 });
  }
  return NextResponse.json({ result: data });
}
