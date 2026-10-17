import { connection, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";

/** Everything Rehang holds about the signed-in person, as one JSON file. Read with their own permissions. */
export async function GET() {
  await connection();
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const viewerId = await getViewerId();
  if (!viewerId) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const supabase = await createClient();
  const [profile, items, favourites, follows, offers, orders, reviewsWritten, reviewsReceived, messages, notifications, verifications] = await Promise.all([
    supabase.from("users").select("handle,display_name,legal_name,email,bio,town_id,verification_level,terms_accepted_at,terms_version,created_at").eq("id", viewerId).maybeSingle(),
    supabase.from("items").select("id,title,description,category_id,size_id,condition,brand_text,colours,price_cents,town_id,status,published_at,created_at").eq("seller_id", viewerId),
    supabase.from("favourites").select("item_id,created_at").eq("user_id", viewerId),
    supabase.from("follows").select("seller_id,created_at").eq("follower_id", viewerId),
    supabase.from("offers").select("id,item_id,amount_cents,status,made_by_seller,created_at").eq("buyer_id", viewerId),
    supabase.from("orders").select("id,item_id,buyer_id,seller_id,amount_cents,status,meetup_at,completed_at,cancelled_at,cancel_reason,created_at").or(`buyer_id.eq.${viewerId},seller_id.eq.${viewerId}`),
    supabase.from("reviews").select("order_id,reviewee_id,rating,comment,created_at").eq("reviewer_id", viewerId),
    supabase.from("reviews").select("order_id,rating,comment,created_at").eq("reviewee_id", viewerId),
    supabase.from("messages").select("conversation_id,body,created_at").eq("sender_id", viewerId),
    supabase.from("notifications").select("kind,payload,read_at,created_at").eq("user_id", viewerId),
    supabase.from("verifications").select("type,status,legal_name,rejection_reason,created_at").eq("user_id", viewerId),
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    note: "Identity document photos and the scrambled ID number are not included. Photos are deleted 7 days after review.",
    profile: profile.data,
    listings: items.data ?? [],
    saved_items: favourites.data ?? [],
    following: follows.data ?? [],
    offers_made: offers.data ?? [],
    orders: orders.data ?? [],
    reviews_written: reviewsWritten.data ?? [],
    reviews_received: reviewsReceived.data ?? [],
    messages_sent: messages.data ?? [],
    notifications: notifications.data ?? [],
    verifications: verifications.data ?? [],
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="rehang-my-data.json"',
      "cache-control": "no-store",
    },
  });
}
