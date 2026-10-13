import "server-only";

import type { RenderedEmail } from "./email";

/** Sends one email through Resend. Returns true when Resend accepted it. */
export async function sendEmail(to: string, email: RenderedEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: email.subject, text: email.text, html: email.html }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
