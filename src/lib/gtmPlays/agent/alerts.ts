/**
 * #5 alerts (11/18 risk review: problems showed only as a red line on /ops #5, so nobody saw them unless they looked).
 * What is sent where something goes wrong, and how often the same kind is sent again. Pure; alerts.server.ts sends.
 * Nothing about a person (no name, no address) goes into an alert.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export type AgentAlertKind =
  | "brake" | "complaint" | "send_paused" | "tick_error" | "tick_killed" | "reply_reading" | "cost_cap_early" | "search_gave_up";

/** The same kind is sent at most once in this long (a problem that lasts is not repeated every 5-minute tick). */
export const ALERT_EVERY_MS: Record<AgentAlertKind, number> = {
  brake: 6 * HOUR_MS,
  complaint: 10 * MINUTE_MS,
  send_paused: HOUR_MS,
  tick_error: HOUR_MS,
  tick_killed: 3 * HOUR_MS,
  reply_reading: 6 * HOUR_MS,
  cost_cap_early: 20 * HOUR_MS,
  search_gave_up: 12 * HOUR_MS,
};

const TITLES: Record<AgentAlertKind, string> = {
  brake: "에이전트가 스스로 꺼졌어요",
  complaint: "스팸 신고가 들어왔어요",
  send_paused: "메일 보내기가 멈췄어요",
  tick_error: "실행 중 오류가 났어요",
  tick_killed: "실행이 끝까지 가지 못하고 멈췄어요",
  reply_reading: "답장을 읽지 못하고 있어요 (후속 메일은 기다려요)",
  cost_cap_early: "오후 3시 전에 하루 비용 한도에 닿았어요",
  search_gave_up: "사람 찾기를 끝내지 못해 건너뛰었어요",
};

/** Cost cap reached before this Korea-time hour: worth a look (a big upload, or a step costing more than it should). */
export const COST_CAP_EARLY_BEFORE_HOUR = 15;

export function alertText(kind: AgentAlertKind, detail: string, opsUrl: string): string {
  const line = detail.replace(/\s+/g, " ").trim().slice(0, 400);
  return `[#5 후보자 소싱 에이전트] ${TITLES[kind]}${line ? `\n${line}` : ""}\n${opsUrl}`;
}

/** Only Slack incoming webhooks are posted to. */
export function alertWebhook(env: Record<string, string | undefined>): string | null {
  const url = env.GTM_AGENT_ALERT_WEBHOOK?.trim() ?? "";
  return /^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(url) ? url : null;
}
