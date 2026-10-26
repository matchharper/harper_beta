import { handleCallback } from "@vercel/queue";
import { processEmailRuntimeMessage } from "@/lib/email/runtime/consumer";
import { EmailPermanentError, EmailContinuationPending } from "@/lib/email/runtime/types";

export const runtime = "nodejs";
export const maxDuration = 480;
const queueCallback = handleCallback(
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

export async function POST(request: Request) {
  return queueCallback(request);
}
