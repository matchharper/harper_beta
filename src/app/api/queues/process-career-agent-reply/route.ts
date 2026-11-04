import { handleCallback } from "@vercel/queue";
import { processCareerAgentReply } from "@/lib/career/agentReplyWorker";
export const runtime = "nodejs";
export const maxDuration = 480;
class CareerReplyDeferred extends Error {}
const callback = handleCallback(async (message) => {
  if (await processCareerAgentReply(message) === false) throw new CareerReplyDeferred("Career execution is waiting");
}, {
  retry: error => error instanceof CareerReplyDeferred ? { afterSeconds: 5 } : undefined,
});
export async function POST(request: Request) { return callback(request); }
