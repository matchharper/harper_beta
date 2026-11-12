import { buildOrgRoleUrl, escapeSlackText, formatSlackLink } from "./slackMessages";

export const INTERNAL_HIRING_CHANNEL = "C0AKK93FMH8";

export type InternalHiringFacts = {
  workspaceId: string; companyName: string; roleId: string; roleName: string;
  talentId: string; talentName: string; actor: string; actorEmail?: string | null;
  action: string; occurredAt: string;
  details: { notifyCandidate?: boolean | null; startsAt?: string | null; endsAt?: string | null;
    previousStartsAt?: string | null; previousEndsAt?: string | null; timezone?: string | null; organizer?: string | null; requester?: string | null };
};

const actions: Record<string, string> = {
  company_connection_accepted: "회사에서 후보자 연결 수락",
  company_connection_declined: "회사에서 후보자 연결 거절",
  company_process_ended: "회사에서 기존 채용 진행 종료",
  company_intro_passed: "회사에서 Intro 후보 패스 — 후보자에게 연결 요청하지 않음",
  candidate_recommendation_accepted: "후보자가 역할 추천 수락 — 회사 연결 결정 대기",
  intro_requested: "회사에서 후보자에게 Intro 요청 — 발송 전",
  intro_sent: "후보자에게 회사 Intro 발송 완료",
  candidate_intro_accepted: "후보자가 회사 Intro 수락",
  candidate_intro_declined: "후보자가 회사 Intro 거절",
  intro_connected: "Intro 수락 후 연결 완료",
  connection_email_sent: "회사·후보자 소개 이메일 발송 완료",
  meeting_confirmed: "미팅 일정 확정",
  meeting_rescheduled: "미팅 일정 변경",
  meeting_cancelled: "확정된 미팅 취소",
};

const plain = (text: string) => String(text).replace(/[\r\n\t]+/g, " ").trim();
const escaped = (text: string) => escapeSlackText(plain(text));
function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
}

export function internalHiringNotificationText(f: InternalHiringFacts) {
  const action = actions[f.action];
  if (!action) throw new Error(`Unknown internal hiring event: ${f.action}`);
  const d = f.details;
  let result = action;
  if (["company_connection_declined", "company_process_ended"].includes(f.action))
    result += d.notifyCandidate === false ? " — 후보자 종료 안내 끔" : " — 후보자 종료 안내 예정";
  if (f.action.startsWith("meeting_")) {
    const tz = d.timezone || "Asia/Seoul";
    if (d.startsAt) {
      const interval = (start: string, end?: string | null) => dateTime(start, tz) + (end ? `~${dateTime(end, tz).slice(11)}` : "");
      const current = interval(d.startsAt, d.endsAt);
      result += f.action === "meeting_rescheduled" && d.previousStartsAt
        ? ` — ${interval(d.previousStartsAt, d.previousEndsAt)} → ${current} (${tz})`
        : ` — ${current} (${tz})`;
    } else result += " — 시각 미기록";
    if (d.organizer) result += ` · 주최 ${d.organizer}`;
  }
  if (f.action === "connection_email_sent" && d.requester) result += ` · 요청 ${d.requester}`;
  const actor = f.actorEmail ? `${f.actor}(${f.actorEmail}, 회사)` : f.actor;
  const role = formatSlackLink(buildOrgRoleUrl(f.workspaceId, f.roleId), plain(`${f.companyName} / ${f.roleName}`));
  return `${role} / ${escaped(f.talentName)} | ${escaped(actor)} | ${escaped(result)} | ${dateTime(f.occurredAt, "Asia/Seoul")} KST`;
}
