import { listTestTalentAccountEmails } from "@/lib/testAccounts";
import { readOnly } from "@/lib/ops/talentMetricsOverview.server";
import {
  EMAIL_ACTION_DAILY_SQL,
  EMAIL_ACTION_WINDOW_HOURS,
  EMAIL_CHOICE_WEB_OPENS_SQL,
  EMAIL_UNSEEN_REPLY_SQL,
} from "@/lib/ops/emailActionMetrics.sql";
import type {
  EmailActionDailyRow,
  OpsEmailActionMetricsResponse,
} from "@/lib/ops/emailActionMetrics";

const KST_OFFSET_MS = 9 * 3_600_000;
const kstDay = (ms: number) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);

/** Computed on each request: the section loads on its own and keeps no snapshot. */
export async function fetchOpsEmailActionMetrics(args: {
  days: number;
  excludedEmails?: string[];
}): Promise<OpsEmailActionMetricsResponse> {
  const excludedEmails = Array.from(
    new Set(
      [...(args.excludedEmails ?? []), ...(await listTestTalentAccountEmails())]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
  const nowMs = Date.now();
  const endDay = kstDay(nowMs);
  const startMs = Date.parse(`${endDay}T00:00:00+09:00`) - (args.days - 1) * 86_400_000;
  const parameters = [new Date(startMs).toISOString(), new Date(nowMs).toISOString(), excludedEmails];
  const [rows, webOpens, [unseenReplies]] = await Promise.all([
    readOnly<EmailActionDailyRow>(EMAIL_ACTION_DAILY_SQL, parameters),
    readOnly<{ day: string; opens: number }>(EMAIL_CHOICE_WEB_OPENS_SQL, parameters),
    readOnly<{ reviewed: number; sent: number }>(EMAIL_UNSEEN_REPLY_SQL, parameters),
  ]);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    startDay: kstDay(startMs),
    endDay,
    windowHours: EMAIL_ACTION_WINDOW_HOURS,
    rows,
    webOpens,
    unseenReplies: unseenReplies ?? { reviewed: 0, sent: 0 },
  };
}
