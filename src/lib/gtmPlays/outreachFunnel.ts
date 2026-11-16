/**
 * #4 숫자 표: what happened to the candidate mails that went out, per Role and per candidate source. Pure (no
 * imports), so the server, the Ops screen and tests count the same way. Every mail here was sent (status sent)
 * to an address outside matchharper.com.
 *   보냄       the mail went out
 *   반송       Resend reported a permanent bounce, a spam complaint or a send failure (delivery_status)
 *   수신 거부  the address opted out after this mail (its own link, or Harper's list later)
 *   클릭       the Harper page the mail's button opens was on screen in a browser (first_opened_at)
 *   가입       someone signed in from the mail and the posting reached their inbox (claimed_at)
 *   관심·지원  the posting they got went on to saved / applied / connected / offer / accepted in their opportunities
 *   회사 연결  the company connected with that person on Harper for that Role (company_intro_candidates)
 */

export type OutreachSource = "member" | "external" | "scraped";

export const OUTREACH_SOURCES: readonly OutreachSource[] = ["member", "external", "scraped"];

export type OutreachBounce = "bounced" | "complained" | "failed";

/** One sent candidate mail and what came of it. */
export type OutreachFunnelMail = {
  id: string;
  /** The Role it is grouped under: the Role id, or `posting:<title>` for a posting never saved as a Role. */
  roleKey: string;
  roleId: string | null;
  roleName: string;
  source: OutreachSource | null;
  toEmail: string;
  sentAt: string;
  bounce: OutreachBounce | null;
  unsubscribed: boolean;
  clickedAt: string | null;
  signedUpAt: string | null;
  /** The imported posting's saved_stage in the person's opportunities (null: untouched or none). */
  stage: string | null;
  connected: boolean;
};

export type OutreachFunnelNumbers = {
  sent: number;
  bounced: number;
  unsubscribed: number;
  clicked: number;
  signedUp: number;
  reacted: number;
  connected: number;
  /** Median time from sending to the click, among clicked mails (null: none clicked). */
  medianClickMs: number | null;
};

export type OutreachFunnelRole = {
  key: string;
  roleId: string | null;
  name: string;
  lastSentAt: string;
  numbers: OutreachFunnelNumbers;
  bySource: Record<OutreachSource, OutreachFunnelNumbers>;
};

/** Stages that show the person did something with the posting after it reached them. */
export const REACTED_STAGES = new Set(["saved", "applied", "connected", "offer", "accepted"]);

const BOUNCES = new Set<string>(["bounced", "complained", "failed"]);

export function outreachBounce(value: string | null | undefined): OutreachBounce | null {
  return value && BOUNCES.has(value) ? (value as OutreachBounce) : null;
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function tallyOutreachMails(mails: readonly OutreachFunnelMail[]): OutreachFunnelNumbers {
  const clickTimes: number[] = [];
  const numbers: OutreachFunnelNumbers = {
    sent: 0, bounced: 0, unsubscribed: 0, clicked: 0, signedUp: 0, reacted: 0, connected: 0, medianClickMs: null,
  };
  for (const mail of mails) {
    numbers.sent += 1;
    if (mail.bounce) numbers.bounced += 1;
    if (mail.unsubscribed) numbers.unsubscribed += 1;
    if (mail.clickedAt) {
      numbers.clicked += 1;
      const wait = Date.parse(mail.clickedAt) - Date.parse(mail.sentAt);
      if (Number.isFinite(wait)) clickTimes.push(Math.max(0, wait));
    }
    if (mail.signedUpAt) numbers.signedUp += 1;
    if (mail.stage && REACTED_STAGES.has(mail.stage)) numbers.reacted += 1;
    if (mail.connected) numbers.connected += 1;
  }
  numbers.medianClickMs = median(clickTimes);
  return numbers;
}

/** One row per Role (newest send first), each also split by candidate source. */
export function groupOutreachMails(mails: readonly OutreachFunnelMail[]): OutreachFunnelRole[] {
  const groups = new Map<string, OutreachFunnelMail[]>();
  for (const mail of mails) groups.set(mail.roleKey, [...(groups.get(mail.roleKey) ?? []), mail]);
  return [...groups.entries()].map(([key, rows]) => {
    const lastSentAt = rows.reduce((last, row) => (row.sentAt > last ? row.sentAt : last), rows[0].sentAt);
    return {
      key,
      roleId: rows[0].roleId,
      name: rows[0].roleName,
      lastSentAt,
      numbers: tallyOutreachMails(rows),
      bySource: outreachBySource(rows),
    };
  }).sort((a, b) => (a.lastSentAt < b.lastSentAt ? 1 : a.lastSentAt > b.lastSentAt ? -1 : 0));
}

export function outreachBySource(mails: readonly OutreachFunnelMail[]): Record<OutreachSource, OutreachFunnelNumbers> {
  return Object.fromEntries(OUTREACH_SOURCES.map((source) => [
    source, tallyOutreachMails(mails.filter((mail) => mail.source === source)),
  ])) as Record<OutreachSource, OutreachFunnelNumbers>;
}

/**
 * Opt-outs that reached Harper's suppression list without the mail recording it (before the mail kept its own
 * unsubscribed_at, or through another Harper mail): counted on the latest mail to that address sent before the
 * opt-out. `optOuts` maps an address to when it went on the list.
 */
export function attributeOptOuts<T extends { id: string; toEmail: string; sentAt: string }>(
  mails: readonly T[], optOuts: ReadonlyMap<string, string>,
): Set<string> {
  const latest = new Map<string, T>();
  for (const mail of mails) {
    const at = optOuts.get(mail.toEmail);
    if (!at || mail.sentAt > at) continue;
    const current = latest.get(mail.toEmail);
    if (!current || mail.sentAt > current.sentAt) latest.set(mail.toEmail, mail);
  }
  return new Set([...latest.values()].map((mail) => mail.id));
}

/** n / d as a whole percent; null when there is nothing to divide by. */
export function outreachRate(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

/** "35분", "6시간", "2일": how long until the click, in the unit that reads easily. */
export function formatClickWait(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}분`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours}시간`;
  return `${Math.round(ms / 86_400_000)}일`;
}

const KST_MINUTE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** "11/16 10:12" in Korea time ("—" when missing or unreadable). */
export function formatKstMinute(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "—";
  const part = Object.fromEntries(KST_MINUTE.formatToParts(date).map((item) => [item.type, item.value]));
  return `${part.month}/${part.day} ${part.hour}:${part.minute}`;
}
