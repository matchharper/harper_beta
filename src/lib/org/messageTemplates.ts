// Templates a company team saves for contacting candidates. Shared by the
// workspace and limited per kind so the picker stays a short list.

export const ORG_MESSAGE_TEMPLATE_LIMIT = 3;

export const ORG_MESSAGE_TEMPLATE_KINDS = ["interview", "intro_email"] as const;

export type OrgMessageTemplateKind =
  (typeof ORG_MESSAGE_TEMPLATE_KINDS)[number];

export type OrgMessageTemplateContent = {
  interview: {
    candidateMessage: string;
    durationMinutes: number;
    meetingPurpose: string;
  };
  intro_email: { body: string; subject: string };
};

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

/** Validates stored or submitted content; null when it has nothing to keep. */
export function normalizeOrgMessageTemplateContent<
  K extends OrgMessageTemplateKind,
>(kind: K, value: unknown): OrgMessageTemplateContent[K] | null {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (kind === "interview") {
    const meetingPurpose = text(record.meetingPurpose, 600);
    const duration = Number(record.durationMinutes);
    const durationMinutes =
      Number.isSafeInteger(duration) &&
      duration >= 15 &&
      duration <= 240 &&
      duration % 15 === 0
        ? duration
        : 60;
    if (!meetingPurpose) return null;
    return {
      candidateMessage: text(record.candidateMessage, 2_000),
      durationMinutes,
      meetingPurpose,
    } as OrgMessageTemplateContent[K];
  }
  const subject = text(record.subject, 200);
  const body = text(record.body, 8_000);
  if (!subject || !body) return null;
  return { body, subject } as OrgMessageTemplateContent[K];
}

export const ORG_INTRO_TEMPLATE_FIELDS = {
  candidateName: "{후보자 이름}",
  companyName: "{회사 이름}",
  roleName: "{역할}",
  senderName: "{내 이름}",
} as const;

/** Fills an intro email template for one candidate. */
export function fillOrgIntroTemplate(
  template: string,
  values: Record<keyof typeof ORG_INTRO_TEMPLATE_FIELDS, string>
) {
  let filled = template;
  for (const [key, token] of Object.entries(ORG_INTRO_TEMPLATE_FIELDS)) {
    filled = filled.split(token).join(values[key as keyof typeof values] ?? "");
  }
  return filled;
}

export const ORG_INTRO_UNKNOWN_FIELD_ERROR =
  "바뀌지 않는 값이 있어요. {후보자 이름} · {회사 이름} · {역할} · {내 이름}만 쓸 수 있어요.";

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
