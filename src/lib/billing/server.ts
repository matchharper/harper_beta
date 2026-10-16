import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type BillingPlanRow = Pick<
  Database["public"]["Tables"]["plans"]["Row"],
  "plan_id" | "name" | "display_name" | "cycle" | "credit" | "price_krw"
>;

export async function resetCreditsForPlan(args: {
  supabaseAdmin: SupabaseClient<Database>;
  userId: string;
  plan: BillingPlanRow;
  eventType: string;
}) {
  const { supabaseAdmin, userId, plan, eventType } = args;
  const creditAmount = Number(plan.credit ?? 0);

  const { data: creditsRow, error: creditsErr } = await supabaseAdmin
    .from("credits")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (creditsErr) throw creditsErr;

  const payload = {
    charged_credit: creditAmount,
    remain_credit: creditAmount,
    last_updated_at: new Date().toISOString(),
    type: plan.name,
  };

  if (creditsRow?.id) {
    const { error } = await supabaseAdmin
      .from("credits")
      .update(payload)
      .eq("id", creditsRow.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("credits").insert({
      user_id: userId,
      ...payload,
    });
    if (error) throw error;
  }

  const { error: historyError } = await supabaseAdmin
    .from("credits_history")
    .insert({
      user_id: userId,
      charged_credits: creditAmount,
      event_type: eventType,
    });

  if (historyError) throw historyError;
}
