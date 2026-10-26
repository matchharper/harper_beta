import { handleCallback } from "@vercel/queue";
import { processDailyRun } from "@/lib/externalRecommendationsV2/daily";
export const runtime = "nodejs";
export const maxDuration = 800;
const queueCallback = handleCallback(
  async (message) => {
    await processDailyRun(message);
  },
  { visibilityTimeoutSeconds: 900, retry: () => ({ afterSeconds: 60 }) }
);

export async function POST(request: Request) {
  return queueCallback(request);
}
