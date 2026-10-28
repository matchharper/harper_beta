import { useEffect, useRef } from "react";
import { postLogEvent } from "@/lib/logEvent";
import type { LogEventMetadata } from "@/lib/logEvent";

export type BillingTrackingContext = {
  workspaceId: string;
  source: "onboarding" | "slots" | "billing";
  preview: boolean;
};

export function trackBillingInteraction(
  context: BillingTrackingContext | undefined,
  action: string,
  metadata: LogEventMetadata = {}
) {
  if (
    !context ||
    context.preview ||
    process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true"
  )
    return;
  // postLogEvent uses keepalive; navigation and modal state never await it.
  void postLogEvent(`org_billing_${action}`, {
    metadata: {
      ...metadata,
      workspaceId: context.workspaceId,
      source: context.source,
    },
  });
}

export function useBillingCheckoutReturnLog(
  context: BillingTrackingContext,
  checkout: unknown,
  sessionId: unknown
) {
  const { workspaceId, source, preview } = context;
  const recorded = useRef("");
  useEffect(() => {
    if (checkout !== "success" && checkout !== "cancelled") {
      recorded.current = "";
      return;
    }
    const key = `${workspaceId}:${checkout}:${sessionId}`;
    if (preview || recorded.current === key) return;
    recorded.current = key;
    // A browser return is not evidence of payment. Webhooks own payment facts.
    trackBillingInteraction(
      { workspaceId, source, preview },
      "checkout_returned",
      {
        result: checkout,
        sessionId: typeof sessionId === "string" ? sessionId : null,
      }
    );
  }, [workspaceId, source, preview, checkout, sessionId]);
}
