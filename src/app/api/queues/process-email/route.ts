import { handleCallback } from "@vercel/queue";
import { processEmailRuntimeMessage } from "@/lib/email/runtime/consumer";
import { EmailPermanentError, EmailContinuationPending } from "@/lib/email/runtime/types";

export const runtime = "nodejs";
export const maxDuration = 480;
export const POST = handleCallback(
  async (message) => {
    await processEmailRuntimeMessage(message);
  },
  {
    visibilityTimeoutSeconds: 600,
    retry: (error) =>
      error instanceof EmailPermanentError
        ? { acknowledge: true }
        : { afterSeconds: error instanceof EmailContinuationPending ? 1 : 60 },
  }
);
