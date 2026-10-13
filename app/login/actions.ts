"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type PhoneActionState = {
  status: "idle" | "sent" | "error";
  message?: string;
  phone?: string;
};

const phoneSchema = z.string().trim().regex(/^\+264[0-9]{7,9}$/, {
  message: "Enter a Namibian number in international format, such as +264 81 123 4567.",
});

export async function requestPhoneOtp(
  _previousState: PhoneActionState,
  formData: FormData,
): Promise<PhoneActionState> {
  const parsedPhone = phoneSchema.safeParse(formData.get("phone"));
  if (!parsedPhone.success) {
    return { status: "error", message: parsedPhone.error.issues[0]?.message };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Phone sign-in is not configured yet. Add the Supabase settings and SMS provider first." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: parsedPhone.data.replaceAll(" ", ""),
    options: { shouldCreateUser: true },
  });

  if (error) {
    return { status: "error", message: "We could not send a code right now. Check the number or try again shortly." };
  }

  return { status: "sent", phone: parsedPhone.data.replaceAll(" ", ""), message: "A sign-in code has been sent if this number can receive SMS." };
}

export async function verifyPhoneOtp(
  _previousState: PhoneActionState,
  formData: FormData,
): Promise<PhoneActionState> {
  const parsed = z.object({
    phone: phoneSchema,
    token: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit code."),
  }).safeParse({
    phone: formData.get("phone"),
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Phone sign-in is not configured yet." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone.replaceAll(" ", ""),
    token: parsed.data.token,
    type: "sms",
  });

  if (error) {
    return { status: "error", message: "That code did not work or has expired. Request a new one and try again." };
  }

  redirect("/onboarding");
}