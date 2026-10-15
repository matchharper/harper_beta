import { handleCallback } from "@vercel/queue";
import { processDailyRun } from "@/lib/externalRecommendationsV2/daily";
export const runtime = "nodejs";
export const maxDuration = 800;
export const POST = handleCallback(
  async (message) => {
    await processDailyRun(message);
  },
  { visibilityTimeoutSeconds: 900, retry: () => ({ afterSeconds: 60 }) }
);
