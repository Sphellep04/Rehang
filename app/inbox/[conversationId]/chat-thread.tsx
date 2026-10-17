"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ReportButton } from "../../_components/report-button";

export type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  flagged_contact: boolean;
  created_at: string;
};

const contactPattern = /(@[a-z0-9_.-]{2,}|(?:\+?264|0)[\s()-]*[0-9][0-9\s().-]{5,}[0-9]|wa\.me|whatsapp|instagram|facebook)/i;

export function ChatThread({
  conversationId,
  currentUserId,
  otherUserId,
  initialMessages,
  initiallyBlocked,
}: {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
  initialMessages: ChatMessage[];
  initiallyBlocked: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const endOfMessages = useRef<HTMLDivElement>(null);
  const isContactDetail = contactPattern.test(body);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const message = payload.new as ChatMessage;
        setMessages((current) => current.some((existing) => existing.id === message.id) ? current : [...current, message]);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        const { data } = await supabase
          .from("messages")
          .select("id,sender_id,body,flagged_contact,created_at")
          .eq("conversation_id", conversationId)
          .order("created_at");
        if (active && data) setMessages(data as ChatMessage[]);
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messageBody = body.trim();
    if (!messageBody || blocked || isSending) return;
    if (messageBody.length > 1000) {
      setNotice("Messages can be up to 1,000 characters.");
      return;
    }

    setNotice("");
    setIsSending(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, body: messageBody })
      .select("id,sender_id,body,flagged_contact,created_at")
      .single();

    if (error) {
      setNotice(error.code === "54000"
        ? "You’ve sent a lot of messages recently. Please wait before sending more."
        : "This message could not be sent. The conversation may be blocked or unavailable.");
    } else if (data) {
      setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data as ChatMessage]);
      setBody("");
    }
    setIsSending(false);
  }

  async function blockUser() {
    if (blocked || !window.confirm("Block this person? You will no longer be able to message each other.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("blocks").insert({ blocked_id: otherUserId });
    if (error) {
      setNotice("This person could not be blocked right now.");
      return;
    }
    setBlocked(true);
    setNotice("This conversation is blocked.");
  }

  return (
    <div className="chat-body">
      <div className="chat-toolbar"><p className="chat-safety-note">Keep payments and conversations in Rehang. We never show personal phone numbers.</p><span className="chat-toolbar-actions"><ReportButton targetType="user" targetId={otherUserId} signedIn label="Report person" /><button className="text-link" type="button" onClick={blockUser} disabled={blocked}>{blocked ? "Blocked" : "Block"}</button></span></div>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 ? <p className="chat-empty">Start with a question about the item.</p> : messages.map((message) => {
          const ownMessage = message.sender_id === currentUserId;
          return <article className={`chat-message ${ownMessage ? "mine" : "theirs"}`} key={message.id}>
            <p>{message.body}</p>
            {message.flagged_contact && <small className="contact-warning">Contact details detected. Keep the trade in Rehang.</small>}
            {!ownMessage && <ReportButton targetType="message" targetId={message.id} signedIn label="Report message" />}
            <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString("en-NA", { hour: "numeric", minute: "2-digit" })}</time>
          </article>;
        })}
        <div ref={endOfMessages} />
      </div>
      {notice && <p className="chat-notice" role="status">{notice}</p>}
      {blocked ? <div className="chat-blocked">This conversation is blocked.</div> : <form className="chat-compose" onSubmit={sendMessage}>
        {isContactDetail && <p className="contact-warning compose-warning">Keep contact details and payments in Rehang. Messages with contact information may be reviewed.</p>}
        <label className="sr-only" htmlFor="chat-message">Write a message</label>
        <textarea id="chat-message" value={body} maxLength={1000} onChange={(event) => setBody(event.target.value)} placeholder="Write a message…" rows={2} />
        <div className="chat-compose-footer"><span>{body.length}/1000</span><button className="button button-ink" type="submit" disabled={!body.trim() || isSending}>{isSending ? "Sending…" : "Send"}</button></div>
      </form>}
    </div>
  );
}
