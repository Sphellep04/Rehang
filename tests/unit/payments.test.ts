import { describe, expect, it } from "vitest";
import { parsePaymentEvent } from "@/lib/payments/events";
import { SIGNATURE_TOLERANCE_SECONDS, signPayload, verifySignature } from "@/lib/payments/signature";

const secret = "test-secret-with-enough-length";
const body = JSON.stringify({ hello: "world" });
const now = 1_800_000_000;

describe("webhook signatures", () => {
  it("accepts a message signed with the secret", () => {
    expect(verifySignature(secret, body, signPayload(secret, body, now), now)).toBe(true);
  });
  it("rejects a changed body", () => {
    expect(verifySignature(secret, body + " ", signPayload(secret, body, now), now)).toBe(false);
  });
  it("rejects the wrong secret", () => {
    expect(verifySignature("another-secret-value-here", body, signPayload(secret, body, now), now)).toBe(false);
  });
  it("rejects old and future-dated messages", () => {
    const header = signPayload(secret, body, now);
    expect(verifySignature(secret, body, header, now + SIGNATURE_TOLERANCE_SECONDS + 1)).toBe(false);
    expect(verifySignature(secret, body, header, now - SIGNATURE_TOLERANCE_SECONDS - 1)).toBe(false);
    expect(verifySignature(secret, body, header, now + SIGNATURE_TOLERANCE_SECONDS)).toBe(true);
  });
  it("rejects a missing, empty or malformed header", () => {
    expect(verifySignature(secret, body, null, now)).toBe(false);
    expect(verifySignature(secret, body, "", now)).toBe(false);
    expect(verifySignature(secret, body, "t=abc,v1=zz", now)).toBe(false);
    expect(verifySignature(secret, body, `t=${now},v1=${"0".repeat(64)}`, now)).toBe(false);
  });
  it("rejects everything when no secret is set", () => {
    expect(verifySignature("", body, signPayload("", body, now), now)).toBe(false);
  });
});

const good = {
  provider: "mock", reference: "pay-123", order_id: "2a2a2a2a-0000-0000-0000-00000000000a",
  kind: "capture", status: "succeeded", amount_cents: 26000,
};

describe("payment events", () => {
  it("parses a good message", () => {
    expect(parsePaymentEvent(good)).toEqual({
      provider: "mock", reference: "pay-123", orderId: good.order_id, kind: "capture", status: "succeeded", amountCents: 26000,
    });
  });
  it("refuses bad shapes", () => {
    expect(parsePaymentEvent(null)).toBeNull();
    expect(parsePaymentEvent("x")).toBeNull();
    expect(parsePaymentEvent({ ...good, order_id: "not-a-uuid" })).toBeNull();
    expect(parsePaymentEvent({ ...good, kind: "refund" })).toBeNull();
    expect(parsePaymentEvent({ ...good, status: "ok" })).toBeNull();
    expect(parsePaymentEvent({ ...good, amount_cents: 12.5 })).toBeNull();
    expect(parsePaymentEvent({ ...good, amount_cents: -1 })).toBeNull();
    expect(parsePaymentEvent({ ...good, provider: "Bad Provider!" })).toBeNull();
    expect(parsePaymentEvent({ ...good, reference: "x" })).toBeNull();
  });
});
