"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerId } from "@/lib/supabase/viewer";
import { simulatorAvailable } from "@/lib/payments/simulator";

/**
 * Staging only: pretends the payment partner confirmed the buyer's payment, by calling the same
 * database function the real webhook calls. Lets the whole delivery flow be tried before a partner exists.
 */
export async function simulatePayment(orderId: string): Promise<{ ok: boolean; message: string }> {
  if (!simulatorAvailable()) return { ok: false, message: "Not available." };
  const viewerId = await getViewerId();
  if (!viewerId) return { ok: false, message: "Please sign in." };
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("buyer_id,status,amount_cents,shipping_cents,buyer_fee_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.buyer_id !== viewerId || order.status !== "awaiting_payment") return { ok: false, message: "This order is not waiting for payment." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "The service key is not set." };
  const total = Number(order.amount_cents) + Number(order.shipping_cents) + Number(order.buyer_fee_cents);
  const { data, error } = await admin.rpc("record_payment", {
    p_order: orderId, p_provider: "simulator", p_reference: `sim-${orderId}-${Date.now()}`,
    p_kind: "capture", p_status: "succeeded", p_amount_cents: total,
  });
  if (error) return { ok: false, message: error.message.includes("payments_off") ? "Payments are switched off." : "Could not record the payment." };
  return { ok: data === "paid", message: String(data) };
}
