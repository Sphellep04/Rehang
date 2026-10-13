"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { tradeError } from "@/lib/trade";

export type DeleteState = { message?: string };

export async function deleteAccount(_previous: DeleteState, formData: FormData): Promise<DeleteState> {
  if (formData.get("confirm") !== "DELETE") return { message: "Type DELETE in capitals to confirm." };
  if (!isSupabaseConfigured()) return { message: "Account deletion is not set up yet." };
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    if (error.message === "open_orders") return { message: "You have an order waiting for a meet-up. Finish or cancel it first, then delete your account." };
    if (error.message === "staff_cannot_self_delete") return { message: "Staff accounts must be demoted before they can be deleted." };
    return { message: tradeError(error.message) };
  }

  // Personal details are already erased. Now close the sign-in itself (a soft delete frees the email address).
  const admin = createAdminClient();
  if (admin) await admin.auth.admin.deleteUser(viewerId, true);
  await supabase.auth.signOut();
  redirect("/");
}
