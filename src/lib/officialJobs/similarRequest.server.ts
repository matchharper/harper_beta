import { isJobPageRequestOpen } from "@/lib/gtmPlays/agent/requestGate.server";

/**
 * Whether the job page may show "비슷한 공고 추천받기" now: the [gtm agent] is on, its job-page request channel is
 * switched on and has room today (agent/requestGate.server.ts). Read by the page's getServerSideProps and by
 * POST /api/official-jobs/similar-request; no "server-only" marker (the Pages Router refuses it).
 */
export async function isOfficialJobsSimilarRequestOpen(): Promise<boolean> {
  return isJobPageRequestOpen();
}
