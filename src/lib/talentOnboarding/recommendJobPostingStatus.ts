import { careerT } from "@/lib/career/translatedCareerMessage";

export type RecommendJobPostingStatusState =
  | "running"
  | "completed"
  | "error"
  | "stopped";

export type RecommendJobPostingStatus = {
  candidateCount?: number | null;
  recommendationCount?: number | null;
  state: RecommendJobPostingStatusState;
};

export const RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLE =
  "좋습니다. 먼저 현재 추천 진행 상태를 확인해볼게요.";
export const RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLE_EN =
  "Got it. Let me first check the status of your recommendations.";
export const RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLES = [
  RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLE,
  RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLE_EN,
] as const;

export function getRecommendJobPostingsChatPreamble(locale?: string | null) {
  return careerT(
    locale,
    "career.recommend_job_postings.chat_preamble",
    RECOMMEND_JOB_POSTINGS_CHAT_PREAMBLE
  );
}

const STATUS_LOG_PREFIX = "[[recommend_job_postings:";
const STATUS_LOG_SUFFIX = "]]";

const normalizeCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;

export function createRecommendJobPostingStatusLog(
  status: RecommendJobPostingStatus
) {
  const parts = [STATUS_LOG_PREFIX + status.state];
  const candidateCount = normalizeCount(status.candidateCount);
  const recommendationCount = normalizeCount(status.recommendationCount);

  if (candidateCount !== null) {
    parts.push(`candidates=${candidateCount}`);
  }
  if (recommendationCount !== null) {
    parts.push(`recommendations=${recommendationCount}`);
  }

  return `${parts.join(":")}${STATUS_LOG_SUFFIX}`;
}

export function parseRecommendJobPostingStatusLog(
  value: unknown
): RecommendJobPostingStatus | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (
    !text.startsWith(STATUS_LOG_PREFIX) ||
    !text.endsWith(STATUS_LOG_SUFFIX)
  ) {
    return null;
  }

  const body = text.slice(
    STATUS_LOG_PREFIX.length,
    text.length - STATUS_LOG_SUFFIX.length
  );
  const [rawState, ...rawParts] = body.split(":");
  if (
    rawState !== "running" &&
    rawState !== "completed" &&
    rawState !== "error" &&
    rawState !== "stopped"
  ) {
    return null;
  }

  const status: RecommendJobPostingStatus = { state: rawState };
  for (const part of rawParts) {
    const [key, rawValue] = part.split("=");
    const count = normalizeCount(Number(rawValue));
    if (count === null) continue;
    if (key === "candidates") status.candidateCount = count;
    if (key === "recommendations") status.recommendationCount = count;
  }

  return status;
}

export function splitRecommendJobPostingStatusLogs(logs: string[]) {
  const textLogs: string[] = [];
  let latestStatus: RecommendJobPostingStatus | null = null;

  for (const log of logs) {
    const status = parseRecommendJobPostingStatusLog(log);
    if (status) {
      latestStatus = status;
      continue;
    }
    textLogs.push(log);
  }

  return { latestStatus, textLogs };
}
