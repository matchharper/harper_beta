import { handleCallback } from "@vercel/queue";
import { processResourceJob } from "@/lib/career/resources/queue";
export const runtime = "nodejs";
export const maxDuration = 800;
const callback = handleCallback(processResourceJob, {
  visibilityTimeoutSeconds: 900,
  retry: () => ({ afterSeconds: 60 }),
});
export async function POST(request: Request) {
  return callback(request);
}
