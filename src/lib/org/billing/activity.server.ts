import { after } from "next/server";
import { billingDb } from "./store";
import type { LogEventMetadata } from "@/lib/logEvent";

// Only the after callback performs I/O. Callers never wait for telemetry.
export function scheduleBillingActivity(
  type: string,
  userId: string | null,
  metadata: LogEventMetadata
) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return;
  try {
    after(async () => {
      try {
        const { error } = await billingDb()
          .from("logs")
          .insert({
            type,
            user_id: userId,
            meta_data: { ...metadata, source: "billing_server" },
          });
        if (error) throw error;
      } catch (error) {
        console.error("[billing/activity]", type, metadata.workspaceId, error);
      }
    });
  } catch (error) {
    console.error("[billing/activity:schedule]", type, error);
  }
}
