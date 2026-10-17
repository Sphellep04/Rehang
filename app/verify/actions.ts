"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { hashIdNumber, isPlausibleIdNumber, normaliseIdNumber } from "@/lib/id-hash";
import { tradeError } from "@/lib/trade";

export type VerifyResult = { ok: true } | { ok: false; message: string };

const schema = z.object({
  documentPath: z.string().min(3).max(300),
  selfiePath: z.string().min(3).max(300),
  legalName: z.string().trim().min(3, "Enter your full name as it appears on your ID.").max(100),
  idNumber: z.string().trim().min(1, "Enter your ID number."),
});

/** The ID number is hashed here on the server and never stored or logged in readable form. */
export async function submitIdVerification(input: z.input<typeof schema>): Promise<VerifyResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Verification is not set up yet." };
  if (!isPlausibleIdNumber(normaliseIdNumber(parsed.data.idNumber))) return { ok: false, message: "That ID number doesn't look right. Use letters and numbers only." };

  const hash = hashIdNumber(parsed.data.idNumber);
  if (!hash) return { ok: false, message: "Verification is not fully set up yet. Please try again later." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_id_verification", {
    p_document_path: parsed.data.documentPath,
    p_selfie_path: parsed.data.selfiePath,
    p_id_number_hash: hash,
    p_legal_name: parsed.data.legalName,
  });
  if (error) return { ok: false, message: tradeError(error.message) };
  return { ok: true };
}
