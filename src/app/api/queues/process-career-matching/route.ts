import { handleCallback } from "@vercel/queue";
import { processCareerMatchingSearch } from "@/lib/career/matching/externalSearch";
export const runtime = "nodejs";
export const maxDuration = 800;
const callback = handleCallback(processCareerMatchingSearch, {
  visibilityTimeoutSeconds: 900,
  retry: () => ({ afterSeconds: 60 }),
});
export async function POST(request: Request) {
  return callback(request);
}
