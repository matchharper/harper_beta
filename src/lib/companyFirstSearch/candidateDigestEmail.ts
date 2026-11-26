import type { OrgLocale } from "@/i18n/org/locale";
import { mailCallName } from "@/lib/email/callName";
import { renderCompanyReplyEmail } from "@/lib/email/runtime/format";
import type { OrgCompanyCriterionFitness } from "@/lib/org/companyCriteriaEvaluations";
import { COMPANY_TERMS } from "@/lib/org/terms";
import { buildOrgHref, orgJobsHomeRedirect } from "@/lib/org/routes";

/** Candidate mail for one role-matching run: fixed subject, greeting and closing,
 * the Worker's email-surface prose for each person, and per-recipient action links. */
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
export type CandidateDigestCriterion = {
  name: string;
  fitness: OrgCompanyCriterionFitness;
};
export type CandidateDigestCandidate = {
  id: string;
  webUrl: string;
  actionUrls: Partial<Record<CandidateDigestAction, string>>;
  /** The company-safe criterion ratings; they only pick which candidate the mail opens with. */
  criteria?: CandidateDigestCriterion[];
  /** Facts for the subject line, from the profile (never model-written). */
  roleName?: string;
  /** The latest experience's role and company, both from that one experience. */
  title?: string | null;
  company?: string | null;
  /** That experience has an end date: the subject says 전 / "a former". A missing end
   * date does not make it current, so the subject never says 현
   * (introEmailProfessionalSummary.ts keeps the same rule). */
  ended?: boolean;
  /** Years since the earliest experience start, as the GTM company mail counts them. */
  years?: number | null;
};

export const CANDIDATE_DIGEST_ACTIONS: Record<
  CandidateDigestKind,
  readonly [CandidateDigestAction, CandidateDigestAction]
> = {
  accepted_connection: ["accept_connection", "reject_connection"],
  company_first: ["request_intro", "pass"],
};

// Labels for candidate email actions: the same names as the web and Slack buttons.
export const CANDIDATE_DIGEST_ACTION_LABELS: Record<
  CandidateDigestAction,
  [string, string]
> = {
  request_intro: [COMPANY_TERMS.action.request.ko, COMPANY_TERMS.action.request.en],
  pass: [COMPANY_TERMS.action.pass.ko, COMPANY_TERMS.action.pass.en],
  accept_connection: [COMPANY_TERMS.action.connect.ko, COMPANY_TERMS.action.connect.en],
  reject_connection: [COMPANY_TERMS.action.pass.ko, COMPANY_TERMS.action.pass.en],
};

const pick = (locale: OrgLocale, pair: readonly [string, string]) =>
  pair[locale === "ko" ? 0 : 1];

const COPY = {
  acceptedHeading: [
    "✅ 연결을 기다리는 후보 · 후보가 이미 만나보겠다고 했어요",
    "✅ Waiting to connect · These candidates already agreed to talk",
  ],
} as const;

/** Mail for the people this run brings (mail-tone review, 2026-11-25): one lead
 * candidate in full with two text links, two more in one line each, the rest behind
 * "see all". No internal list names, no criteria marks, the recipient's name, and
 * Harper's sign-off. The ✅ list (candidates already said yes) keeps its own text.
 * It reads like a mail a person wrote in Gmail (2026-11-26): no box, background or
 * button, because those read as an automated newsletter, which gets fewer replies and
 * can land in a promotions tab or break in some mail apps. */
export const DIGEST_OTHERS_SHOWN = 2;

function clip(value: string | null | undefined, max: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** "경력 6년" / "6 years"; "" when unknown or under a year. */
function careerYears(locale: OrgLocale, years: number | null | undefined) {
  if (typeof years !== "number" || !Number.isFinite(years) || years < 1) return "";
  const whole = Math.floor(years);
  return locale === "ko" ? `경력 ${whole}년` : `${whole} ${whole === 1 ? "year" : "years"}`;
}

function uniqueRoles(roleNames: string[]) {
  return [...new Set(roleNames.map((name) => name.trim()).filter(Boolean))];
}

function roleLabel(locale: OrgLocale, roleNames: string[]) {
  return uniqueRoles(roleNames)[0] ?? (locale === "ko" ? "역할" : "your role");
}

/** English names the Role as "your Founding Engineer role". */
function englishRole(role: string) {
  return /\brole$/i.test(role) ? role : `${role} role`;
}

/** "a" or "an" before an English job title, by how its first word sounds: an acronym by
 * its first letter's name ("an ML Engineer", "a UX Designer"), a word by its first letter
 * with the common exceptions ("a User Researcher", "an Hourly Lead"). */
export function englishArticle(title: string) {
  const word = title.trim().split(/\s+/)[0] ?? "";
  if (/^[A-Z]{2}/.test(word) || /^[A-Z][&./-]/.test(word))
    return /^[AEFHILMNORSX]/.test(word) ? "an" : "a";
  const lower = word.toLowerCase();
  if (/^(hour|honest|honor|honour|heir)/.test(lower)) return "an";
  if (/^(uni|use|usu|uti|ubi|eu|one\b|once)/.test(lower)) return "a";
  if (/^(8|11(?!\d)|18(?!\d))/.test(lower)) return "an";
  return /^[aeiou]/.test(lower) ? "an" : "a";
}

/** "{Role}", or "{Role} 외 k개 역할" / "{Role} and k more roles" when the people span more. */
function rolesPhrase(locale: OrgLocale, roleNames: string[]) {
  const roles = uniqueRoles(roleNames);
  const first = clip(roles[0] ?? roleLabel(locale, []), 60);
  const others = roles.length - 1;
  if (others <= 0) return first;
  return locale === "ko"
    ? `${first} 외 ${others}개 역할`
    : `${first} and ${others} more ${others === 1 ? "role" : "roles"}`;
}

export function candidateDigestSubject(args: {
  locale: OrgLocale;
  recipientName?: string;
  roleNames: string[];
  acceptedCount: number;
  companyFirstCount: number;
  /** The candidate the mail opens with, when the mail has new people. */
  lead?: CandidateDigestCandidate | null;
  /** The Roles of the people who already said yes, in mail order. */
  acceptedRoleNames?: string[];
}) {
  const { locale } = args;
  if (args.acceptedCount > 0) {
    // People who already said yes come first in the mail and in the subject, under their Roles.
    const acceptedRoles = uniqueRoles(args.acceptedRoleNames ?? []);
    const role = rolesPhrase(locale, acceptedRoles.length ? acceptedRoles : args.roleNames);
    const count = args.acceptedCount;
    return locale === "ko"
      ? `${role}: 만나보겠다고 한 분이 ${count}명 있어요`
      : `${role}: ${count} ${count === 1 ? "person" : "people"} said yes to talking`;
  }
  const role = clip(args.lead?.roleName || roleLabel(locale, args.roleNames), 60);
  const lead = args.lead;
  const company = clip(lead?.company, 30);
  if (locale === "ko") {
    const facts = [company && lead?.ended ? `전 ${company}` : company, careerYears(locale, lead?.years)]
      .filter(Boolean);
    const found = args.companyFirstCount > 1
      ? `${role}에 딱 맞는 분 한 분 찾았어요`
      : `${role}에 딱 맞는 분을 찾았어요`;
    return facts.length ? `${found} (${facts.join(", ")})` : found;
  }
  // "[Name], a [hook about the lead]. Worth a look?": the article keeps the title on the
  // lead, so the recipient's name is not read as the person with that title.
  const name = mailCallName(args.recipientName);
  const title = clip(lead?.title, 50);
  const hook = /^[A-Za-z0-9]/.test(title)
    ? `${lead?.ended ? "a former" : englishArticle(title)} ${title}${company ? ` at ${company}` : ""}`
    : company
      ? `someone from ${company}`
      : `someone new for your ${englishRole(role)}`;
  const line = `${hook}. Worth a look?`;
  return name ? `${name}, ${line}` : `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}

function escapeMarkdownText(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

/** "Hi Dana," / "Dana님 안녕하세요": a Latin name by its first word, a Hangul name whole (`mailCallName`). */
function greeting(locale: OrgLocale, recipientName: string) {
  const name = escapeMarkdownText(mailCallName(recipientName));
  if (locale === "ko")
    return name ? `${name}님 안녕하세요, Harper입니다.` : "안녕하세요, Harper입니다.";
  return name ? `Hi ${name},` : "Hi,";
}

/** The opening names the lead's Role; "외 N개 역할" when the new people span more Roles. */
function openingLine(locale: OrgLocale, role: string, otherRoles: number, count: number) {
  const name = escapeMarkdownText(role);
  if (locale === "ko") {
    const where = otherRoles > 0 ? `${name} 외 ${otherRoles}개 역할` : name;
    return count > 1
      ? `${where}에 새로 ${count}분 찾았는데, 이 분부터 보시면 좋겠어요.`
      : `${where}에 맞을 만한 분을 새로 찾았어요.`;
  }
  const where = `${escapeMarkdownText(englishRole(role))}${
    otherRoles > 0 ? ` and ${otherRoles} more ${otherRoles === 1 ? "role" : "roles"}` : ""
  }`;
  return count > 1
    ? `${count} new people for your ${where}. The one I'd start with:`
    : `One new person for your ${where}:`;
}

function othersLine(locale: OrgLocale, count: number) {
  if (locale === "ko") return count === 1 ? "다른 한 분도 있어요." : "다른 두 분도 있어요.";
  return count === 1 ? "One more in your list:" : "Two more in your list:";
}

function seeAllLabel(locale: OrgLocale, total: number) {
  return locale === "ko" ? `전체 ${total}명 보기` : `See all ${total}`;
}

const CLOSING: readonly [string, string] = [
  "만나보고 싶은 분이 있으면 제가 먼저 관심을 확인하고 연결해 드릴게요.",
  "If you'd like to meet anyone, I'll make sure they're interested before connecting you.",
];
const SIGN_OFF: readonly [string, string] = ["Harper 드림", "Harper"];

/** Under the ✅ heading: how many are on that list now, new ones included. */
function totalLine(locale: OrgLocale, total: number) {
  return locale === "ko" ? `지금 모두 ${total}명` : `${total} in total now`;
}

const SECTION_SPACER_MARKER = "HARPERDIGESTSECTIONSPACERX";

type DigestLink = { label: string; url: string };

const ASK: Record<CandidateDigestKind, { ko: (name: string) => string; en: (name: string) => string }> = {
  company_first: {
    ko: (name) => (name ? `${name}님을 만나보시겠어요?` : "만나보시겠어요?"),
    en: (name) => (name ? `Want to meet ${name}?` : "Want an intro?"),
  },
  accepted_connection: {
    ko: (name) => (name ? `${name}님과 연결해 드릴까요?` : "연결해 드릴까요?"),
    en: (name) => (name ? `Want me to connect you with ${name}?` : "Want me to connect you?"),
  },
};
const REPLY_HINT: readonly [string, string] = [
  "이 메일에 답장만 주셔도 되고, 링크로 바로 정하셔도 돼요:",
  "Just reply to this email, or use these links:",
];

/** "Want to meet Dana? Just reply to this email, or use these links: Request intro / Pass
 * for now": the two actions as plain text links under the person. A reply reaches Harper
 * with this mail as its context (companyReply.ts), so only the mail's first ask says so. */
function askLine(
  locale: OrgLocale,
  kind: CandidateDigestKind,
  name: string,
  links: DigestLink[],
  mentionReply: boolean
) {
  const question = ASK[kind][locale === "ko" ? "ko" : "en"](escapeMarkdownText(name));
  const ask = mentionReply ? `${question} ${pick(locale, REPLY_HINT)}` : question;
  return {
    markdown: `${ask} ${links.map((link) => `[${escapeMarkdownText(link.label)}](${link.url})`).join(" / ")}`,
    // Reply context for Harper: the same sentence without the one-time URLs.
    reply: `${ask} ${links.map((link) => link.label).join(" / ")}`,
  };
}

const CRITERION_WEIGHT: Record<OrgCompanyCriterionFitness, number> = {
  excellent: 2,
  good: 1,
  uncertain: 0,
  limited: 0,
  bad: -1,
  conflict: -1,
};

/** The candidate the mail opens with: the strongest finished ratings, then the Worker's order. */
export function pickLeadCandidate<T extends { candidateId: string }>(
  parts: T[],
  byId: Map<string, CandidateDigestCandidate>
) {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const part of parts) {
    const score = (byId.get(part.candidateId)?.criteria ?? []).reduce(
      (sum, item) => sum + CRITERION_WEIGHT[item.fitness],
      0
    );
    if (score > bestScore) {
      best = part;
      bestScore = score;
    }
  }
  return best;
}

const MARKDOWN_LINK = /\[([^\]\r\n]+)\]\(([^()\s]+)\)/;

/** A Worker candidate text: the first line names and links the person, the rest describes them. */
function splitCandidateText(text: string) {
  const trimmed = text.trim();
  const breakAt = trimmed.indexOf("\n");
  const line = (breakAt < 0 ? trimmed : trimmed.slice(0, breakAt)).trim();
  const rest = breakAt < 0 ? "" : trimmed.slice(breakAt + 1).trim();
  return { line, rest };
}

/** Where the description first names the person as a whole word ("Lee", not the "Lee"
 * in "Leeds"). Korean particles may follow a Korean name directly. */
function nameAt(rest: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const after = /[\p{L}\p{N}]$/u.test(name) && !/[가-힣]$/.test(name) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${after}`, "u").exec(rest)?.index ?? -1;
}

/** The lead in full. When the description names the person, the name carries the link
 * and the one-line summary is left for the others; otherwise the whole text stays. */
export function leadCandidateText(text: string) {
  const { line, rest } = splitCandidateText(text);
  const link = line.match(MARKDOWN_LINK);
  if (!rest || !link) return text.trim();
  const name = link[1]!.trim();
  const at = nameAt(rest, name);
  if (at < 0) return text.trim();
  return `${rest.slice(0, at)}[${name}](${link[2]})${rest.slice(at + name.length)}`;
}

/** One line for a candidate after the lead: the line that names and links the person,
 * which is the first line when the Worker keeps its format. */
export function otherCandidateLine(text: string) {
  const lines = text.trim().split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => MARKDOWN_LINK.test(line)) ?? lines[0] ?? "";
}

/** How the ask calls the person: the name the Worker linked ("Sam Lee" → "Sam",
 * "김민준" whole, `mailCallName`); "" when the text links no one. The label is Markdown, so
 * escapes, emphasis, a leading mark such as ✅ and a "님" the Worker added come off first. */
export function candidateCallName(text: string) {
  const label = otherCandidateLine(text).match(MARKDOWN_LINK)?.[1] ?? "";
  const name = label
    .replace(/\\(.)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, "")
    .replace(/\s*님$/u, "");
  return mailCallName(name);
}

/** "See all": the Role's 연결을 요청할 후보 list, the same inbox list the total counts, on
 * the candidate links' site; Home's 역할 when the new people span several Roles. */
function seeAllUrl(people: CandidateDigestCandidate[], orgId: string) {
  const urls = people.flatMap((person) => {
    try {
      return [new URL(person.webUrl)];
    } catch {
      return [];
    }
  });
  const first = urls[0];
  if (!first || !orgId) return null;
  const roleIds = [...new Set(urls.map((url) => url.searchParams.get("roleId")).filter(Boolean))];
  const path = roleIds.length === 1
    ? buildOrgHref({ orgId, roleId: roleIds[0], page: "role", tab: "inbox", inboxStage: "company_intro" })
    : orgJobsHomeRedirect({ orgId });
  const url = new URL(path, first.origin);
  url.searchParams.set("source", "email");
  return url.toString();
}

export function buildCandidateDigestEmail(args: {
  locale: OrgLocale;
  recipientName: string;
  roleNames: string[];
  sections: CandidateDigestSection[];
  candidates: CandidateDigestCandidate[];
  workspaceId: string;
  /**
   * Everyone on each list now for these Roles (the inbox rule). ✅ shows it under its
   * heading; the new-people part uses it for "see all". Left out when unknown.
   */
  totals?: Partial<Record<CandidateDigestKind, number>>;
}) {
  const { locale } = args;
  const byId = new Map(
    args.candidates.map((candidate) => [candidate.id, candidate])
  );
  const merged = (kind: CandidateDigestKind) =>
    args.sections
      .filter((section) => section.kind === kind)
      .flatMap((section) => section.parts);
  const acceptedParts = merged("accepted_connection");
  const companyFirstParts = merged("company_first");
  const hasCandidate = (parts: CandidateDigestSection["parts"]) =>
    parts.some((part) => part.candidateId);
  if (!hasCandidate(acceptedParts) && !hasCandidate(companyFirstParts))
    throw new Error("Candidate mail requires at least one candidate");

  // The people whose links this mail shows. Only their links are stored, and each
  // stored link records an email presentation for its person (company_presentations).
  const actionCandidateIds: string[] = [];
  const actionUrls: string[] = [];
  const blocks: string[] = [greeting(locale, args.recipientName)];
  const replyBlocks: string[] = [...blocks];
  const counts: Record<CandidateDigestKind, number> = {
    accepted_connection: 0,
    company_first: 0,
  };
  // A person with links: their text as a plain paragraph, then the ask with the two links.
  const pushPerson = (kind: CandidateDigestKind, candidateId: string, text: string, name: string) => {
    const candidate = byId.get(candidateId);
    const links = CANDIDATE_DIGEST_ACTIONS[kind].map((action) => ({
      label: pick(locale, CANDIDATE_DIGEST_ACTION_LABELS[action]),
      url: candidate?.actionUrls[action] ?? "",
    }));
    if (!candidate || links.some((link) => !link.url))
      throw new Error("Candidate mail action links are missing");
    const ask = askLine(locale, kind, name, links, actionCandidateIds.length === 0);
    blocks.push(text, ask.markdown);
    replyBlocks.push(text, ask.reply);
    actionCandidateIds.push(candidateId);
    actionUrls.push(...links.map((link) => link.url));
  };

  // ✅ first: the Worker's text for people who already said yes, each with its links.
  if (hasCandidate(acceptedParts)) {
    const heading = `### ${pick(locale, COPY.acceptedHeading)}`;
    blocks.push(heading);
    replyBlocks.push(heading);
    const total = args.totals?.accepted_connection;
    if (typeof total === "number" && total > 0) {
      blocks.push(totalLine(locale, total));
      replyBlocks.push(totalLine(locale, total));
    }
    for (const part of acceptedParts) {
      if (!part.candidateId) {
        blocks.push(part.text.trim());
        replyBlocks.push(part.text.trim());
        continue;
      }
      counts.accepted_connection++;
      pushPerson("accepted_connection", part.candidateId, part.text.trim(), candidateCallName(part.text));
    }
  }

  let lead: CandidateDigestCandidate | null = null;
  if (hasCandidate(companyFirstParts)) {
    const people = companyFirstParts.filter(
      (part): part is { candidateId: string; text: string } => Boolean(part.candidateId)
    );
    counts.company_first = people.length;
    const leadPart = pickLeadCandidate(people, byId)!;
    lead = byId.get(leadPart.candidateId) ?? null;
    const others = people.filter((part) => part !== leadPart).slice(0, DIGEST_OTHERS_SHOWN);
    // The Worker's intro is replaced by the fixed opening; a closing it wrote (a first
    // result's question) stays before Harper's own closing.
    const lastPersonAt = companyFirstParts.length - 1 -
      [...companyFirstParts].reverse().findIndex((part) => part.candidateId);
    const workerClosing = companyFirstParts
      .slice(lastPersonAt + 1)
      .map((part) => part.text.trim())
      .filter(Boolean);

    if (hasCandidate(acceptedParts)) blocks.push(SECTION_SPACER_MARKER);
    const shown = people.map((part) => byId.get(part.candidateId)).filter(
      (item): item is CandidateDigestCandidate => Boolean(item)
    );
    const leadRole = lead?.roleName || roleLabel(locale, args.roleNames);
    const roles = new Set(shown.map((item) => item.roleName?.trim()).filter(Boolean));
    const opening = openingLine(locale, leadRole, Math.max(0, roles.size - 1), people.length);
    blocks.push(opening);
    replyBlocks.push(opening);
    pushPerson("company_first", leadPart.candidateId, leadCandidateText(leadPart.text), candidateCallName(leadPart.text));
    if (others.length) {
      const list = [othersLine(locale, others.length),
        others.map((part) => `- ${otherCandidateLine(part.text)}`).join("\n")];
      blocks.push(...list);
      replyBlocks.push(...list);
    }
    const knownTotal = args.totals?.company_first;
    const total = typeof knownTotal === "number" && knownTotal >= people.length ? knownTotal : people.length;
    const allUrl = seeAllUrl(shown, args.workspaceId);
    if (allUrl) blocks.push(`[${seeAllLabel(locale, total)}](${allUrl})`);
    blocks.push(...workerClosing);
    replyBlocks.push(...workerClosing);
    blocks.push(pick(locale, CLOSING));
    replyBlocks.push(pick(locale, CLOSING));
  }
  blocks.push(pick(locale, SIGN_OFF));
  replyBlocks.push(pick(locale, SIGN_OFF));

  const rendered = renderCompanyReplyEmail(
    blocks.join("\n\n"),
    args.workspaceId
  );
  let html = rendered.html;
  let text = rendered.text;
  // Every one-time link must come out as a link. Worker text can break the Markdown (an
  // unclosed code fence), and the mail would then show and record links nobody can click.
  const hrefs = new Set(
    [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!.replace(/&(?:amp|#x26);/g, "&"))
  );
  if (actionUrls.some((url) => !hrefs.has(url)))
    throw new Error("Candidate mail action links could not be placed");
  if (blocks.includes(SECTION_SPACER_MARKER)) {
    // A table spacer is reliable in email clients and leaves shared heading styles alone.
    html = html.replace(
      new RegExp(`<p[^>]*>${SECTION_SPACER_MARKER}</p>`),
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td height="24" style="height:24px;font-size:1px;line-height:24px">&nbsp;</td></tr></table>'
    );
    text = text.replace(`${SECTION_SPACER_MARKER}\n\n`, "");
  }
  return {
    subject: candidateDigestSubject({
      locale,
      recipientName: args.recipientName,
      roleNames: args.roleNames,
      acceptedCount: counts.accepted_connection,
      companyFirstCount: counts.company_first,
      lead,
      acceptedRoleNames: acceptedParts.flatMap((part) =>
        part.candidateId ? [byId.get(part.candidateId)?.roleName ?? ""] : []
      ),
    }),
    actionCandidateIds,
    // Reply context for Harper: the visible prose without the one-time action URLs.
    replyContext: replyBlocks.join("\n\n"),
    html,
    text,
  };
}
