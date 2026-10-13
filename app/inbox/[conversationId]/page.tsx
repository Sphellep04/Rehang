import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ChatThread, type ChatMessage } from "./chat-thread";

type ConversationPageProps = { params: Promise<{ conversationId: string }> };

export default function ConversationPage({ params }: ConversationPageProps) {
  if (!isSupabaseConfigured()) redirect("/login");

  return (
    <main className="auth-page inbox-page">
      <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link><Link href="/inbox">All messages</Link></header>
      <Suspense fallback={<div className="auth-loading">Loading conversation…</div>}><ConversationContent params={params} /></Suspense>
    </main>
  );
}

async function ConversationContent({ params }: ConversationPageProps) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) redirect("/login");

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,item_id,buyer_id,seller_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) notFound();
  const otherUserId = conversation.buyer_id === userId ? conversation.seller_id : conversation.buyer_id;
  const [{ data: profile }, { data: item }, { data: initialMessages }, { data: blocked }] = await Promise.all([
    supabase.from("public_profiles").select("display_name").eq("id", otherUserId).maybeSingle(),
    conversation.item_id ? supabase.from("items").select("title").eq("id", conversation.item_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("messages").select("id,sender_id,body,flagged_contact,created_at").eq("conversation_id", conversationId).order("created_at"),
    supabase.rpc("users_blocked_pair", { first_user: userId, second_user: otherUserId }),
  ]);

  return (
    <section className="chat-layout">
      <div className="chat-heading">
        <Link className="back-link" href="/inbox">← Messages</Link>
        <div><span className="conversation-avatar">{(profile?.display_name ?? "R").charAt(0).toUpperCase()}</span><span><b>{profile?.display_name ?? "Rehang member"}</b><small>{item?.title ?? "Marketplace conversation"}</small></span></div>
      </div>
      <ChatThread
        conversationId={conversationId}
        currentUserId={userId}
        otherUserId={otherUserId}
        initialMessages={(initialMessages ?? []) as ChatMessage[]}
        initiallyBlocked={blocked.data === true}
      />
    </section>
  );
}
