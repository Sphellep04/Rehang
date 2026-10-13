"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = { message?: string } | undefined;

const profileSchema = z.object({
  handle: z.string().trim().regex(/^[a-z0-9_]{3,20}$/, "Use 3–20 lowercase letters, numbers, or underscores."),
  displayName: z.string().trim().min(2).max(40, "Your name must be 40 characters or fewer."),
  townId: z.coerce.number().int().positive("Choose a town."),
  bio: z.string().trim().max(160, "Your bio must be 160 characters or fewer."),
  acceptedTerms: z.literal("on", "Please accept the terms to continue."),
});

const termsVersion = "draft-v1.0";

export async function completeProfile(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = profileSchema.safeParse({
    handle: formData.get("handle"),
    displayName: formData.get("display_name"),
    townId: formData.get("town_id"),
    bio: formData.get("bio") ?? "",
    acceptedTerms: formData.get("accept_terms"),
  });

  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check your details and try again." };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims.sub) redirect("/login");

  const { error } = await supabase.rpc("complete_profile", {
    p_handle: parsed.data.handle,
    p_display_name: parsed.data.displayName,
    p_town_id: parsed.data.townId,
    p_bio: parsed.data.bio || null,
    p_terms_version: termsVersion,
  });

  if (error) {
    if (error.code === "23505") return { message: "That shop handle is already taken. Try another one." };
    if (error.code === "42501") redirect("/login");
    return { message: "We couldn’t save your profile. Please check your details and try again." };
  }

  redirect("/");
}