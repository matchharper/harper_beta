import { handleCallback } from "@vercel/queue";
import { processCareerAgentReply } from "@/lib/career/agentReplyWorker";
import { CareerInvocationRetryLater } from "@/lib/career/agentReplyError";
export const runtime = "nodejs";
export const maxDuration = 480;
class CareerReplyDeferred extends Error {}
const callback = handleCallback(async (message) => {
  if (await processCareerAgentReply(message) === false) throw new CareerReplyDeferred("Career execution is waiting");
}, {
  retry: error => error instanceof CareerReplyDeferred ? { afterSeconds: 5 }
    : error instanceof CareerInvocationRetryLater ? { afterSeconds: error.retryAfterSeconds } : undefined,
});
export async function POST(request: Request) { return callback(request); }
