// Shapes and arithmetic for the email action section of /ops/update-metrics. Shared by the server and screen.

export type EmailActionKind = "choice_reply" | "choice_web" | "plain";

export type EmailActionCounts = {
  /** Emails whose 72-hour window is still running; their actions can still arrive. */
  openEmails: number;
  emails: number;
  acted: number;
  emailReply: number;
  chat: number;
  opportunity: number;
};

export type EmailActionDailyRow = EmailActionCounts & {
  day: string;
  kind: EmailActionKind;
};

export type OpsEmailActionMetricsResponse = {
  generatedAt: string;
  /** KST dates, inclusive. */
  startDay: string;
  endDay: string;
  windowHours: number;
  rows: EmailActionDailyRow[];
  webOpens: Array<{ day: string; opens: number }>;
  /** Replies left unseen in Career that the agent reviewed, and the emails it sent for them, in this window. */
  unseenReplies?: { reviewed: number; sent: number };
};

export const EMAIL_ACTION_KIND_LABELS: Record<EmailActionKind, string> = {
  choice_reply: "버튼 메일 · 답장 창으로 열림",
  choice_web: "버튼 메일 · 웹 채팅으로 열림",
  plain: "버튼 없는 메일",
};

const EMPTY: EmailActionCounts = {
  openEmails: 0,
  emails: 0,
  acted: 0,
  emailReply: 0,
  chat: 0,
  opportunity: 0,
};

export function addCounts(...items: EmailActionCounts[]): EmailActionCounts {
  return items.reduce(
    (sum, item) => ({
      openEmails: sum.openEmails + item.openEmails,
      emails: sum.emails + item.emails,
      acted: sum.acted + item.acted,
      emailReply: sum.emailReply + item.emailReply,
      chat: sum.chat + item.chat,
      opportunity: sum.opportunity + item.opportunity,
    }),
    EMPTY
  );
}

export function rate(part: number, whole: number) {
  return whole > 0 ? part / whole : null;
}

/** Every KST date from start to end, inclusive. */
export function daysBetween(startDay: string, endDay: string) {
  const days: string[] = [];
  for (
    let time = Date.parse(`${startDay}T00:00:00Z`);
    time <= Date.parse(`${endDay}T00:00:00Z`);
    time += 86_400_000
  )
    days.push(new Date(time).toISOString().slice(0, 10));
  return days;
}

export type EmailActionDay = {
  day: string;
  byKind: Record<EmailActionKind, EmailActionCounts>;
  webOpens: number;
};

export function emailActionDays(response: OpsEmailActionMetricsResponse): EmailActionDay[] {
  const byDay = new Map<string, EmailActionDay>(
    daysBetween(response.startDay, response.endDay).map((day) => [
      day,
      { day, byKind: { choice_reply: EMPTY, choice_web: EMPTY, plain: EMPTY }, webOpens: 0 },
    ])
  );
  for (const row of response.rows) {
    const day = byDay.get(row.day);
    if (day) day.byKind[row.kind] = addCounts(day.byKind[row.kind], row);
  }
  for (const row of response.webOpens) {
    const day = byDay.get(row.day);
    if (day) day.webOpens += row.opens;
  }
  return [...byDay.values()];
}

export const choiceCounts = (day: EmailActionDay) =>
  addCounts(day.byKind.choice_reply, day.byKind.choice_web);
export const allCounts = (day: EmailActionDay) =>
  addCounts(day.byKind.choice_reply, day.byKind.choice_web, day.byKind.plain);

export type EmailActionPoint = {
  day: string;
  label: string;
  /** Some emails in this point still have time left to be answered. */
  pending: boolean;
  /** The emails behind each line, for the tooltip and the volume bars. */
  counts: { all: EmailActionCounts; choice: EmailActionCounts; plain: EmailActionCounts };
  all: number | null;
  choice: number | null;
  plain: number | null;
  emailReply: number | null;
  chat: number | null;
  opportunity: number | null;
};

/**
 * Daily points, or each day's trailing seven days added together. Button and no-button lines start on the first
 * day a button email went out; before it every email had no buttons and the overall line says the same thing.
 */
export function emailActionPoints(days: EmailActionDay[], rolling: boolean): EmailActionPoint[] {
  const firstChoiceIndex = days.findIndex((day) => choiceCounts(day).emails > 0);
  return days.map((day, index) => {
    const range = rolling ? days.slice(Math.max(0, index - 6), index + 1) : [day];
    const all = addCounts(...range.map(allCounts));
    const choice = addCounts(...range.map(choiceCounts));
    const plain = addCounts(...range.map((item) => item.byKind.plain));
    const split = firstChoiceIndex !== -1 && index >= firstChoiceIndex;
    return {
      day: day.day,
      label: `${Number(day.day.slice(5, 7))}.${Number(day.day.slice(8, 10))}`,
      pending: all.openEmails > 0,
      counts: { all, choice, plain },
      all: rate(all.acted, all.emails),
      choice: split ? rate(choice.acted, choice.emails) : null,
      plain: split ? rate(plain.acted, plain.emails) : null,
      emailReply: rate(all.emailReply, all.emails),
      chat: rate(all.chat, all.emails),
      opportunity: rate(all.opportunity, all.emails),
    };
  });
}

export type EmailActionSummary = {
  firstChoiceDay: string | null;
  /** Latest seven days whose every email has had its full window, and the seven days before them. */
  recent: { counts: EmailActionCounts; from: string; to: string } | null;
  previous: { counts: EmailActionCounts; from: string; to: string } | null;
  /** From the first button email, over days whose windows have closed. */
  sinceChoice: Record<EmailActionKind, EmailActionCounts> | null;
  webOpensSinceChoice: number;
};

export function summarizeEmailActions(days: EmailActionDay[]): EmailActionSummary {
  const closed = days.filter((day) => allCounts(day).openEmails === 0 && allCounts(day).emails > 0);
  const period = (items: EmailActionDay[]) =>
    items.length
      ? { counts: addCounts(...items.map(allCounts)), from: items[0].day, to: items[items.length - 1].day }
      : null;
  const firstChoiceDay = days.find((day) => choiceCounts(day).emails > 0)?.day ?? null;
  const afterChoice = firstChoiceDay ? closed.filter((day) => day.day >= firstChoiceDay) : [];
  return {
    firstChoiceDay,
    recent: period(closed.slice(-7)),
    previous: period(closed.slice(-14, -7)),
    sinceChoice: firstChoiceDay
      ? {
          choice_reply: addCounts(...afterChoice.map((day) => day.byKind.choice_reply)),
          choice_web: addCounts(...afterChoice.map((day) => day.byKind.choice_web)),
          plain: addCounts(...afterChoice.map((day) => day.byKind.plain)),
        }
      : null,
    webOpensSinceChoice: firstChoiceDay
      ? days.filter((day) => day.day >= firstChoiceDay).reduce((sum, day) => sum + day.webOpens, 0)
      : 0,
  };
}
