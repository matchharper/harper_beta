import type { OrgLocale } from "@/i18n/org/locale";
import { renderCompanyReplyEmail } from "@/lib/email/runtime/format";
import {
  companyCriterionFitnessLabel,
  type OrgCompanyCriterionFitness,
} from "@/lib/org/companyCriteriaEvaluations";

/** Candidate mail for one role-matching run: fixed subject and section headings,
 * the Worker's email-surface prose unchanged, and per-recipient action buttons. */
export type CandidateDigestKind = "accepted_connection" | "company_first";
export type CandidateDigestAction =
  | "request_intro"
  | "pass"
  | "accept_connection"
  | "reject_connection";
export type CandidateDigestSection = {
  kind: CandidateDigestKind;
  parts: Array<{ candidateId: string | null; text: string }>;
};
export type CandidateDigestCriterion = { name: string; fitness: OrgCompanyCriterionFitness };
export type CandidateDigestCandidate = {
  id: string;
  webUrl: string;
  actionUrls: Partial<Record<CandidateDigestAction, string>>;
  /** The company-safe criterion ratings, as on the web card; the evidence stays on the web. */
  criteria?: CandidateDigestCriterion[];
};

export const CANDIDATE_DIGEST_ACTIONS: Record<
  CandidateDigestKind,
  readonly [CandidateDigestAction, CandidateDigestAction]
> = {
  accepted_connection: ["accept_connection", "reject_connection"],
  company_first: ["request_intro", "pass"],
};

// Labels for candidate email actions.
export const CANDIDATE_DIGEST_ACTION_LABELS: Record<
  CandidateDigestAction,
  [string, string]
> = {
  request_intro: ["Intro 요청하기", "Request intro"],
  pass: ["Pass", "Pass"],
  accept_connection: ["연결 수락", "Connect"],
  reject_connection: ["연결 거절", "Reject"],
};

const pick = (locale: OrgLocale, pair: readonly [string, string]) =>
  pair[locale === "ko" ? 0 : 1];

const COPY = {
  acceptedName: ["연결 대기", "Ready to connect"],
  companyFirstName: ["먼저 제안 가능한 후보", "Suggested candidates"],
  acceptedHeading: [
    "✅ 연결 대기 · 후보가 이미 만나보겠다고 했어요",
    "✅ Ready to connect · These candidates already agreed to talk",
  ],
  companyFirstHeading: ["먼저 제안 가능한 후보", "Suggested candidates"],
} as const;

function countPhrase(locale: OrgLocale, kind: CandidateDigestKind, count: number) {
  const name = pick(
    locale,
    kind === "accepted_connection" ? COPY.acceptedName : COPY.companyFirstName
  );
  return locale === "ko" ? `${name} ${count}명` : `${name} (${count})`;
}

export function candidateDigestSubject(args: {
  locale: OrgLocale;
  roleNames: string[];
  acceptedCount: number;
  companyFirstCount: number;
}) {
  const counts = [
    ...(args.acceptedCount > 0
      ? [countPhrase(args.locale, "accepted_connection", args.acceptedCount)]
      : []),
    ...(args.companyFirstCount > 0
      ? [countPhrase(args.locale, "company_first", args.companyFirstCount)]
      : []),
  ].join(" · ");
  const roles = [...new Set(args.roleNames.map((name) => name.trim()).filter(Boolean))];
  const first = roles[0] ?? (args.locale === "ko" ? "역할" : "Role");
  const others = roles.length - 1;
  const prefix =
    others <= 0
      ? first
      : args.locale === "ko"
        ? `${first} 외 ${others}개 역할`
        : `${first} and ${others} more ${others === 1 ? "role" : "roles"}`;
  return `${prefix}: ${counts}`;
}

function escapeMarkdownText(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function greeting(locale: OrgLocale, recipientName: string) {
  const name = escapeMarkdownText(recipientName.trim());
  if (locale === "ko")
    return name ? `${name}님, Harper가 찾은 후보예요.` : "Harper가 찾은 후보예요.";
  return name
    ? `${name}, here are the candidates Harper found.`
    : "Here are the candidates Harper found.";
}

const ACTION_ROW_MARKER = (index: number) => `HARPERDIGESTACTIONS${index}X`;
const CARD_START_MARKER = (index: number) => `HARPERDIGESTCARD${index}X`;
const SECTION_SPACER_MARKER = "HARPERDIGESTSECTIONSPACERX";
// One card per candidate with a light fill, no border or shadow.
const CARD_OPEN =
  '<div style="border-radius:10px;background:#f9fafb;padding:16px 16px 4px;margin:0 0 12px">';
const CARD_DIVIDER = "────────────────────";

type ActionRow = {
  primary: { label: string; url: string };
  secondary: { label: string; url: string };
  criteria: Array<{ name: string; fitness: OrgCompanyCriterionFitness; label: string }>;
};

// Colors and filled bars of the web icons (public/svgs/<fitness>.svg), drawn without images.
const CRITERION_BARS: Record<OrgCompanyCriterionFitness, { box: string; bar: string; filled: number }> = {
  excellent: { box: "#00B25B", bar: "#FFFFFF", filled: 3 },
  good: { box: "#E6FBED", bar: "#00B25B", filled: 2 },
  uncertain: { box: "#FFF4C2", bar: "#FF9900", filled: 2 },
  bad: { box: "#FFDBD6", bar: "#A92011", filled: 1 },
  conflict: { box: "#FFDBD6", bar: "#A92011", filled: 1 },
  limited: { box: "#FFF4C2", bar: "#FF9900", filled: 2 },
};

function criteriaHtml(criteria: ActionRow["criteria"]) {
  if (!criteria.length) return "";
  const bars = (fitness: OrgCompanyCriterionFitness) => {
    const style = CRITERION_BARS[fitness];
    const cells = [4, 7, 10].map((height, index) =>
      `<td style="padding:0 1px;vertical-align:bottom"><div style="width:3px;height:${height}px;border-radius:2px;background:${style.bar};opacity:${index < style.filled ? 1 : 0.25}"></div></td>`
    ).join("");
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${style.box};border-radius:4px;padding:3px"><tr>${cells}</tr></table>`;
  };
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 12px">${criteria
    .map((item) => `<tr><td role="img" aria-label="${escapeHtml(item.label)}" style="padding:2px 8px 2px 0;vertical-align:middle">${bars(item.fitness)}</td><td style="padding:2px 0;font-size:13px;line-height:1.4;color:#374151">${escapeHtml(item.name)}</td></tr>`)
    .join("")}</table>`;
}

function criteriaText(criteria: ActionRow["criteria"]) {
  return criteria.map((item) => {
    const filled = CRITERION_BARS[item.fitness].filled;
    return `${"▮".repeat(filled)}${"▯".repeat(3 - filled)} ${item.name} · ${item.label}`;
  });
}

/** Table and inline styles keep the buttons intact across mail clients. */
export function candidateDigestActionRowHtml(row: ActionRow) {
  const button = (
    item: { label: string; url: string },
    filled: boolean
  ) =>
    `<td style="padding:0 8px 8px 0"><a href="${escapeHtml(item.url)}" style="display:inline-block;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:500;line-height:1.2;text-decoration:none;${
      filled
        ? "background:#111827;border:1px solid #111827;color:#ffffff"
        : "background:#ffffff;border:1px solid #d1d5db;color:#111827"
    }">${escapeHtml(item.label)}</a></td>`;
  return `${criteriaHtml(row.criteria)}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px"><tr>${button(
    row.primary,
    true
  )}${button(row.secondary, false)}</tr></table>`;
}

export function candidateDigestActionRowText(row: ActionRow) {
  const lines = criteriaText(row.criteria);
  return [
    ...(lines.length ? [lines.join("\n"), ""] : []),
    [row.primary, row.secondary].map((item) => `${item.label}: ${item.url}`).join("\n"),
  ].join("\n");
}

export function buildCandidateDigestEmail(args: {
  locale: OrgLocale;
  recipientName: string;
  roleNames: string[];
  sections: CandidateDigestSection[];
  candidates: CandidateDigestCandidate[];
  workspaceId: string;
}) {
  const { locale } = args;
  const byId = new Map(args.candidates.map((candidate) => [candidate.id, candidate]));
  // Several rows of one kind (chunks) share one heading; ✅ always comes first.
  const ordered = (["accepted_connection", "company_first"] as const)
    .map((kind) => ({
      kind,
      parts: args.sections
        .filter((section) => section.kind === kind)
        .flatMap((section) => section.parts),
    }))
    .filter((section) => section.parts.some((part) => part.candidateId));
  if (!ordered.length) throw new Error("Candidate mail requires at least one candidate");

  const rows: ActionRow[] = [];
  const blocks: string[] = [greeting(locale, args.recipientName)];
  const replyBlocks: string[] = [...blocks];
  const counts: Record<CandidateDigestKind, number> = {
    accepted_connection: 0,
    company_first: 0,
  };
  for (const section of ordered) {
    const heading = `### ${pick(
      locale,
      section.kind === "accepted_connection"
        ? COPY.acceptedHeading
        : COPY.companyFirstHeading
    )}`;
    if (section.kind === "company_first") blocks.push(SECTION_SPACER_MARKER);
    blocks.push(heading);
    replyBlocks.push(heading);
    for (const part of section.parts) {
      if (part.candidateId) blocks.push(CARD_START_MARKER(rows.length));
      blocks.push(part.text.trim());
      replyBlocks.push(part.text.trim());
      if (!part.candidateId) continue;
      const candidate = byId.get(part.candidateId);
      const [primary, secondary] = CANDIDATE_DIGEST_ACTIONS[section.kind];
      const primaryUrl = candidate?.actionUrls[primary];
      const secondaryUrl = candidate?.actionUrls[secondary];
      if (!candidate || !primaryUrl || !secondaryUrl)
        throw new Error("Candidate mail action links are missing");
      counts[section.kind]++;
      const criteria = (candidate.criteria ?? []).map((item) => ({
        ...item,
        label: companyCriterionFitnessLabel(item.fitness, locale),
      }));
      // Harper's reply context carries the same ratings as plain lines, without URLs.
      if (criteria.length) replyBlocks.push(criteriaText(criteria).join("\n"));
      blocks.push(ACTION_ROW_MARKER(rows.length));
      rows.push({
        criteria,
        primary: { label: pick(locale, CANDIDATE_DIGEST_ACTION_LABELS[primary]), url: primaryUrl },
        secondary: { label: pick(locale, CANDIDATE_DIGEST_ACTION_LABELS[secondary]), url: secondaryUrl },
      });
    }
  }
  const rendered = renderCompanyReplyEmail(blocks.join("\n\n"), args.workspaceId);
  let html = rendered.html;
  let text = rendered.text;
  if (counts.company_first > 0) {
    // A table spacer is reliable in email clients and leaves shared heading styles alone.
    html = html.replace(new RegExp(`<p[^>]*>${SECTION_SPACER_MARKER}</p>`),
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="24" style="height:24px;font-size:1px;line-height:24px">&nbsp;</td></tr></table>');
    text = text.replace(`${SECTION_SPACER_MARKER}\n\n`, "");
  }
  rows.forEach((row, index) => {
    const marker = ACTION_ROW_MARKER(index);
    const cardMarker = CARD_START_MARKER(index);
    const htmlPattern = new RegExp(`<p[^>]*>${marker}</p>`);
    const cardPattern = new RegExp(`<p[^>]*>${cardMarker}</p>`);
    if (!htmlPattern.test(html) || !text.includes(marker) || !cardPattern.test(html) || !text.includes(cardMarker))
      throw new Error("Candidate mail action row could not be placed");
    // The card opens before the candidate's text and closes after its buttons.
    html = html.replace(cardPattern, () => CARD_OPEN);
    html = html.replace(htmlPattern, () => `${candidateDigestActionRowHtml(row)}</div>`);
    text = text.replace(cardMarker, () => CARD_DIVIDER);
    text = text.replace(marker, () => candidateDigestActionRowText(row));
  });
  return {
    subject: candidateDigestSubject({
      locale,
      roleNames: args.roleNames,
      acceptedCount: counts.accepted_connection,
      companyFirstCount: counts.company_first,
    }),
    // Reply context for Harper: the visible prose without one-time button URLs.
    replyContext: replyBlocks.join("\n\n"),
    html,
    text,
  };
}
