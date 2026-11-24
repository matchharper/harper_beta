"use server";

import { unsubscribeCrmBroadcastByLink } from "@/lib/career/crmBroadcastSubscription.server";

export type CrmUnsubscribeResult = "done" | "invalid" | "error" | null;

/** The confirmation button. The signed token in the link is the only authorization, as in the API route. */
export async function unsubscribeCrmBroadcast(
  _previous: CrmUnsubscribeResult,
  form: FormData
): Promise<CrmUnsubscribeResult> {
  try {
    const result = await unsubscribeCrmBroadcastByLink({
      token: String(form.get("t") ?? ""),
      userId: String(form.get("u") ?? ""),
    });
    return result.ok ? "done" : "invalid";
  } catch (error) {
    console.error("[crm-unsubscribe] failed", error);
    return "error";
  }
}
