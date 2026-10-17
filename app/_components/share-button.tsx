"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

type Props = { url: string; text: string; object: "item" | "shop" };

/** Native share sheet where the phone has one, plus WhatsApp and copy link, which most people in Namibia use. */
export function ShareButton({ url, text, object }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = `${url}${url.includes("?") ? "&" : "?"}ref=share`;

  async function share() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url: link });
        track("share_clicked", { channel: "native", object });
        return;
      } catch {
        // Cancelled, or not allowed: fall through to the list.
      }
    }
    setOpen((value) => !value);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track("share_clicked", { channel: "copy_link", object });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", link);
    }
  }

  return (
    <span className="share-button">
      <button type="button" className="button button-outline" onClick={share} aria-expanded={open}>Share</button>
      {open && (
        <span className="share-options" role="group" aria-label="Share options">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("share_clicked", { channel: "whatsapp", object })}>WhatsApp</a>
          <button type="button" onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
        </span>
      )}
    </span>
  );
}
