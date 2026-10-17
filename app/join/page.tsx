import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthShell } from "../_components/auth-shell";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join the waiting list | Rehang",
  description: "Rehang is a Windhoek-first marketplace for second-hand clothes. Join the waiting list for an invite.",
};

export default function JoinPage({ searchParams }: PageProps<"/join">) {
  return (
    <AuthShell title="Join the waiting list" lead="We are opening Rehang in small groups so every meet-up spot and moderator can keep up." intro="We only use your email to invite you. No spam, and you can ask us to remove it any time.">
      <Suspense fallback={<p className="trade-hint">Loading…</p>}>
        <JoinContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function JoinContent({ searchParams }: { searchParams: PageProps<"/join">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const source = typeof params.ref === "string" ? params.ref.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) : "";
  let towns: string[] = [];
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.from("towns").select("name").order("name");
    towns = (data ?? []).map((town) => town.name as string);
  }
  return <JoinForm source={source} towns={towns} />;
}
