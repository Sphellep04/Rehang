import { describe, expect, it } from "vitest";
import { escapeHtml, renderDigestEmail, renderNotificationEmail } from "@/lib/email";

describe("email rendering", () => {
  it("escapes HTML in names and titles", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    const mail = renderNotificationEmail("order_created", { order_id: "o1" }, "Ann <script>");
    expect(mail?.html).not.toContain("<script>");
    expect(mail?.html).toContain("Ann &lt;script&gt;");
  });
  it("links to the order", () => {
    const mail = renderNotificationEmail("meetup_confirmed", { order_id: "o1" }, null);
    expect(mail?.text).toContain("/orders/o1");
  });
  it("shows reminder time in Windhoek time", () => {
    const mail = renderNotificationEmail("meetup_reminder", { meetup_at: "2026-10-14T10:00:00Z", order_id: "o1" }, null);
    expect(mail?.text).toContain("12:00");
  });
  it("returns null for in-app only kinds", () => {
    expect(renderNotificationEmail("strike_issued", {}, null)).toBeNull();
  });
  it("summarises a digest and counts the rest", () => {
    const mail = renderDigestEmail([{ id: "1", title: "Dress", price_cents: 15000, seller: "Sam", handle: "sam" }], 10, null);
    expect(mail.subject).toBe("10 new listings from people you follow");
    expect(mail.text).toContain("N$150");
    expect(mail.text).toContain("9 more");
  });
});
