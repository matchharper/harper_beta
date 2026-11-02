import { handleCallback } from "@vercel/queue";
import { processCareerAgentReply } from "@/lib/career/agentReplyWorker";
export const runtime = "nodejs";
export const maxDuration = 480;
const callback = handleCallback(processCareerAgentReply);
export async function POST(request: Request) { return callback(request); }
