/** Recipient-scoped policy. No transport, database, or model dependency. */
export const SLACK_CONNECTION_REMINDER_TOPIC = "slack_connection";
export type ReminderReceipt = { recipientId: string; sentAt: string; eventId: string };
export type ReminderWorkspace = {
  name: string;
  internal: boolean;
  membership: string;
  setupUrl: string;
  roles: Array<{
    name: string; active: boolean; testOnly: boolean; canDeliverToSlack: boolean;
    setupNeeded: string;
    pendingConnectionCount: number;
    readyCandidateCount: number;
    previouslyPresentedReadyCount: number;
  }>;
};
export type ReminderRecipient = {
  id: string; name: string | null; locale: "ko" | "en";
  verifiedEmail: boolean; suppressed: boolean;
  workspaces: ReminderWorkspace[];
};

/** The caller supplies authoritative snapshots, including receipts across ALL workspaces.
 * Run on Mon/Wed/Fri, KST. First contact, then >=48h, then >=72h; cap three per person.
 * Empty candidate lists do not change eligibility. Transport retries use the same event ID.
 */
export function planSlackConnectionReminder(recipient: ReminderRecipient, receipts: ReminderReceipt[], now: Date) {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid reminder time");
  const local = new Date(now.getTime() + 9 * 3600_000);
  if (![1, 3, 5].includes(local.getUTCDay())) return null;
  if (!recipient.verifiedEmail || recipient.suppressed) return null;
  const history = [...new Map(receipts.filter(r => r.recipientId === recipient.id).map(r => [r.eventId, r])).values()]
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  if (history.some(r => !Number.isFinite(Date.parse(r.sentAt)))) throw Error("Invalid receipt timestamp");
  if (history.length >= 3) return null;
  const last = history.at(-1);
  const gap = history.length === 1 ? 48 : 72;
  if (last && now.getTime() - Date.parse(last.sentAt) < gap * 3600_000) return null;
  const workspaces = recipient.workspaces.filter(w => w.internal && ["owner", "admin"].includes(w.membership))
    .map(w => ({ name: w.name, setupUrl: w.setupUrl,
      roles: w.roles.filter(r => r.active && !r.testOnly && !r.canDeliverToSlack).map(r => {
        for (const count of [r.pendingConnectionCount, r.readyCandidateCount, r.previouslyPresentedReadyCount])
          if (!Number.isSafeInteger(count) || count < 0) throw Error("Incomplete candidate counts");
        if (r.previouslyPresentedReadyCount > r.readyCandidateCount) throw Error("Invalid presentation count");
        return { name: r.name, setupNeeded: r.setupNeeded,
          candidateFacts: {
            "이 역할 진행 의사를 밝히고 회사 연결 결정을 기다리는 사람 수": r.pendingConnectionCount,
            "회사가 먼저 연락해볼 만한 사람으로 선정해 현재 검토 가능한 사람 수": r.readyCandidateCount,
            "그중 실제로 회사에 이미 소개한 사람 수": r.previouslyPresentedReadyCount,
          } };
      }) })).filter(w => w.roles.length);
  if (!workspaces.length) return null;
  return {
    recipientId: recipient.id,
    eventKey: `slack-connection/${recipient.id}/${history.length + 1}`,
    round: history.length + 1,
    // IDs and technical policy stay out of the writing input.
    facts: { recipientName: recipient.name, workspaces,
      previousNoticeDates: history.map(r => r.sentAt),
      supportedHelp: "Slack 연결 후 정기 실행에서 확인한 채용 소식을 주기적으로 전달하고, 팀원과 대화하며 후보 검토와 다음 채용 진행을 도울 수 있다. 소식 전달은 정기 실행 기준이며 실시간 알림 서비스가 아니다.",
      emailPreference: "이 메일에 답장해서 Slack 연결 안내만 또는 Harper의 선제 안내 이메일 전체 수신 중단을 요청할 수 있다." },
  };
}
