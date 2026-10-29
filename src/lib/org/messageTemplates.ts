// Templates a company team saves for contacting candidates. Shared by the
// workspace and limited per kind so the picker stays a short list.

export const ORG_MESSAGE_TEMPLATE_LIMIT = 3;

/**
 * One kind: the intro email, which also carries the interview booking link
 * and its settings. (Separate interview templates were folded into it.)
 */
export const ORG_MESSAGE_TEMPLATE_KINDS = ["intro_email"] as const;

export type OrgMessageTemplateKind =
  (typeof ORG_MESSAGE_TEMPLATE_KINDS)[number];

export type OrgMessageTemplateContent = {
  intro_email: {
    body: string;
    /** Length of the meeting offered by the booking link. */
    durationMinutes: number;
    /** What the meeting is about, shown with the booking link. */
    meetingPurpose: string;
    subject: string;
  };
};

export const ORG_MEETING_DURATIONS = [15, 30, 45, 60, 90, 120];
export const ORG_DEFAULT_MEETING_DURATION = 60;

export type OrgMessageTemplate<
  K extends OrgMessageTemplateKind = OrgMessageTemplateKind,
> = {
  content: OrgMessageTemplateContent[K];
  id: string;
  kind: K;
  name: string;
};

const text = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/\u0000/g, "")
        .trim()
        .slice(0, max)
    : "";

/**
 * Validates stored or submitted content; null when it has nothing to keep.
 * Every kind is an intro email today, so `_kind` only types the result.
 */
export function normalizeOrgMessageTemplateContent<
  K extends OrgMessageTemplateKind,
>(_kind: K, value: unknown): OrgMessageTemplateContent[K] | null {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const subject = text(record.subject, 200);
  const body = text(record.body, 8_000);
  if (!subject || !body) return null;
  const duration = Number(record.durationMinutes);
  return {
    body,
    durationMinutes:
      Number.isSafeInteger(duration) &&
      duration >= 15 &&
      duration <= 240 &&
      duration % 15 === 0
        ? duration
        : ORG_DEFAULT_MEETING_DURATION,
    meetingPurpose: text(record.meetingPurpose, 600),
    subject,
  } as OrgMessageTemplateContent[K];
}

export const ORG_INTRO_TEMPLATE_FIELDS = {
  candidateName: "{후보자 이름}",
  companyName: "{회사 이름}",
  roleName: "{역할}",
  senderName: "{내 이름}",
  /** Replaced with the time-picking link when the email is sent. */
  bookingLink: "{면접 예약 링크}",
} as const;

/**
 * Fills an intro email template for one candidate. `bookingLink` is left
 * as the field when the server adds the link, or "" when there is none.
 */
export function fillOrgIntroTemplate(
  template: string,
  values: Record<keyof typeof ORG_INTRO_TEMPLATE_FIELDS, string>
) {
  let filled = template;
  for (const [key, token] of Object.entries(ORG_INTRO_TEMPLATE_FIELDS)) {
    filled = filled.split(token).join(values[key as keyof typeof values] ?? "");
  }
  // A line that only held a removed link goes with it.
  return filled.replace(/\n{3,}/g, "\n\n").trim();
}

export const ORG_INTRO_UNKNOWN_FIELD_ERROR =
  "바뀌지 않는 값이 있어요. {후보자 이름} · {회사 이름} · {역할} · {내 이름} · {면접 예약 링크}만 쓸 수 있어요.";

/**
 * Puts the time-picking link where the team wrote {면접 예약 링크}, or at the
 * end. Without a link the field is dropped. A body that already has the link
 * (a retried send) stays as it is.
 */
export function withOrgIntroBookingLink(
  body: string,
  link: { label: string; url: string } | null
) {
  const field = ORG_INTRO_TEMPLATE_FIELDS.bookingLink;
  if (!link) {
    return body
      .split(field)
      .join("")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (body.includes(link.url)) return body;
  const markdown = `[${link.label}](${link.url})`;
  return body.includes(field)
    ? body.split(field).join(markdown)
    : `${body.trimEnd()}\n\n${markdown}`;
}

/** The plain-text part of the email shows the link as "words: URL". */
export function orgIntroBookingLinkAsText(
  body: string,
  link: { label: string; url: string } | null
) {
  return link
    ? body
        .split(`[${link.label}](${link.url})`)
        .join(`${link.label}: ${link.url}`)
    : body;
}

const FIELD_TOKEN = /\{[^{}\n]{1,30}\}/g;
const knownFieldTokens = new Set<string>(
  Object.values(ORG_INTRO_TEMPLATE_FIELDS)
);
const compactField = (token: string) => token.replace(/\s+/g, "");

/** `{...}` tokens that would reach the candidate unchanged, e.g. a typo. */
export function findUnknownOrgIntroFields(...texts: string[]) {
  const unknown = new Set<string>();
  for (const text of texts) {
    for (const token of text.match(FIELD_TOKEN) ?? []) {
      if (!knownFieldTokens.has(token)) unknown.add(token);
    }
  }
  return [...unknown];
}

/** The field a mistyped token most likely meant (spacing only). */
export function suggestOrgIntroField(token: string) {
  return (
    [...knownFieldTokens].find(
      (field) => compactField(field) === compactField(token)
    ) ?? null
  );
}
