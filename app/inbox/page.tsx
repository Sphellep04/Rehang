import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type ConversationRow = {
  id: string;
  item_id: string | null;
  buyer_id: string;
  seller_id: string;
  last_message_at: string | null;
  created_at: string;
};

export default function InboxPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  return (
    <main className="auth-page inbox-page">
      <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link><Link href="/">Marketplace</Link></header>
      <Suspense fallback={<div className="auth-loading">Loading inbox…</div>}><InboxContent /></Suspense>
    </main>
  );
}

async function InboxContent() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) redirect("/login");

  const { data: rows } = await supabase
    .from("conversations")
    .select("id,item_id,buyer_id,seller_id,last_message_at,created_at")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const conversations = (rows ?? []) as ConversationRow[];
  if (conversations.length === 0) {
    return (
      <section className="inbox-empty">
        <p className="eyebrow">MESSAGES</p>
        <h1>Your conversations will appear here.</h1>
        <p>Open a live listing and choose “Message seller” to start a conversation.</p>
        <Link className="button button-ink" href="/">Browse listings</Link>
      </section>
    );
  }

  const otherUserIds = [...new Set(conversations.map((conversation) => conversation.buyer_id === userId ? conversation.seller_id : conversation.buyer_id))];
  const itemIds = [...new Set(conversations.flatMap((conversation) => conversation.item_id ? [conversation.item_id] : []))];
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [{ data: profiles }, { data: items }, { data: messages }] = await Promise.all([
    supabase.from("public_profiles").select("id,display_name,handle").in("id", otherUserIds),
    itemIds.length ? supabase.from("items").select("id,title").in("id", itemIds) : Promise.resolve({ data: [] }),
    supabase.from("messages").select("id,conversation_id,body,created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const latestByConversation = new Map<string, { body: string; created_at: string }>();
  for (const message of messages ?? []) {
    if (!latestByConversation.has(message.conversation_id)) {
      latestByConversation.set(message.conversation_id, message);
    }
  }

  return (
    <section className="inbox-layout">
      <div className="inbox-heading"><div><p className="eyebrow">YOUR MARKETPLACE</p><h1>Messages</h1></div><Link className="button button-outline" href="/">Browse items</Link></div>
      <div className="conversation-list">
        {conversations.map((conversation) => {
          const otherId = conversation.buyer_id === userId ? conversation.seller_id : conversation.buyer_id;
          const profile = profileById.get(otherId);
          const item = conversation.item_id ? itemById.get(conversation.item_id) : null;
          const latest = latestByConversation.get(conversation.id);
          const name = profile?.display_name ?? "Rehang member";
          return (
            <Link className="conversation-row" href={`/inbox/${conversation.id}`} key={conversation.id}>
              <span className="conversation-avatar">{name.charAt(0).toUpperCase()}</span>
              <span className="conversation-main"><b>{name}</b><span>{item?.title ?? "Marketplace conversation"}</span><small>{latest?.body ?? "No messages yet"}</small></span>
              <time>{new Date(conversation.last_message_at ?? conversation.created_at).toLocaleDateString("en-NA", { day: "numeric", month: "short" })}</time>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
