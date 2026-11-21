/**
 * #5 company mail words (GTM mail review rev 4, 11/20, with the lead's copy review 11/21): the one place the fixed
 * text of the non-customer company mail lives. S1 = an interested candidate left a question, S2 = interested, no
 * question, S3 = the same posting's thread again after a new interested candidate. KO/EN follow the posting. Code
 * fills every slot (counts, names of the company and the posting, candidate lines); no AI sentence goes in here
 * except each candidate's second line, which agent/companyMail.ts has checked for names, employers, schools and links.
 * {회사}/{공고명} are only ever followed by 의 or 포지션 (a Latin name makes 은/는, 이/가 a guess). Pure.
 */
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmOptOutMarkdown } from "../shared";

export type CompanyMailLanguage = "ko" | "en";
export type CompanyMailVariant = "S1" | "S2" | "S3";

/** One candidate bullet: line 1 by code (title · years · location), line 2 the checked one-liner (or none). */
export type CompanyCandidateLine = {
  line1: string;
  line2: string | null;
  /** An interested external candidate ("(직접 관심)"); Harper members are not. */
  interested: boolean;
  /** S3: the question this new interested candidate asked (nameless), shown under their bullet. */
  question?: string | null;
};

export type CompanyMailCopyInput = {
  variant: CompanyMailVariant;
  language: CompanyMailLanguage;
  companyName: string;
  postingTitle: string;
  /** {N}: visible candidates actually counted (interested external + Harper members). */
  visible: number;
  /** S3 {이전 N}: N in the previous company mail of the thread. */
  previousVisible?: number | null;
  /** Interested external candidates this mail is about (S1/S2: all of them; S3: the new ones). */
  interested: number;
  /** S1: the questions (one nameless sentence each), in order. */
  questions?: readonly string[];
  /** The bullets, at most COMPANY_LINES_MAX (agent/companyMail.ts picks them). */
  lines: readonly CompanyCandidateLine[];
  /** Interested candidates without a summary consent: only the "한 분 더" line (S1/S2), never a summary. */
  unnamedInterested: number;
  /** S3: the questions of new interested candidates without a summary consent (no bullet to hang them on). */
  unnamedQuestions?: readonly string[];
  /** S3: the previous mail's subject ("Re: " goes in front once). */
  previousSubject?: string | null;
  senderName: string;
  /** The company landing (/org?gtm=<mail id>). */
  landingUrl: string;
  unsubscribeUrl: string | null;
};

const KO_COUNT = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];
const EN_COUNT = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const koCount = (n: number) => KO_COUNT[n] ?? String(n);
const enCount = (n: number) => EN_COUNT[n] ?? String(n);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** The first name an English mail introduces ("Ashley Kim" → "Ashley"). */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function companyMailSubject(args: Pick<CompanyMailCopyInput, "variant" | "language" | "postingTitle" | "previousSubject"> & { visible?: number }): string {
  const title = oneLine(args.postingTitle, 120);
  // One candidate (the minimum can be 1 on /ops): no plural.
  const one = args.visible === 1;
  const first = args.language === "en"
    ? `${one ? "A candidate" : "Candidates"} for your ${title} role`
    : `${title} 포지션에 맞는 ${one ? "분이" : "분들이"} 있어 연락드려요`;
  if (args.variant !== "S3") return first;
  return replySubject(args.previousSubject?.trim() || first);
}

/** "Re: " once in front of a thread's subject. */
export function replySubject(subject: string): string {
  const clean = oneLine(subject, 200);
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

/** Line 1 of a candidate (by code): "백엔드 엔지니어 · 경력 6년 · 서울" / "Backend Engineer · 6 years · Seoul". */
export function candidateLine1(args: { title: string | null; years: number | null; location: string | null }, language: CompanyMailLanguage): string {
  return [oneLine(args.title, 60), careerYears(args.years, language), oneLine(args.location, 40)].filter(Boolean).join(" · ");
}

/** "경력 6년" / "6 years"; "" when unknown. */
export function careerYears(years: number | null, language: CompanyMailLanguage): string {
  if (years === null || !Number.isFinite(years) || years < 0) return "";
  const whole = Math.floor(years);
  if (language === "ko") return whole < 1 ? "경력 1년 미만" : `경력 ${whole}년`;
  return whole < 1 ? "under 1 year" : whole === 1 ? "1 year" : `${whole} years`;
}

function oneLine(value: string | null | undefined, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

/** A question as quoted in the mail: its own quote marks taken off, then “…”. */
function quoted(question: string): string {
  return `“${oneLine(question, 300).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim()}”`;
}

const paragraph = (...parts: string[]) => parts.filter(Boolean).join("\n");

const COPY = {
  ko: {
    greeting: (company: string) => `안녕하세요, ${company} 채용 담당자님.`,
    intro: (sender: string) => `Harper에서 회사 채용을 돕고 있는 ${sender}입니다.`,
    count: (company: string, title: string, n: number) => `${company}의 ${title} 포지션에 맞는 분이 ${n}명 있어 연락드려요.`,
    askLead: (k: number, q: number, n: number) => (n === 1
      ? "이분은 이 포지션에 직접 관심을 보이면서, 지원 전에 하나만 확인하고 싶어 하세요."
      : k <= 1
      ? "그중 한 분은 이 포지션에 직접 관심을 보이면서, 지원 전에 하나만 확인하고 싶어 하세요."
      : q <= 1
        ? `그중 ${koCount(k)} 분은 이 포지션에 직접 관심을 보이셨고, 한 분은 지원 전에 하나만 확인하고 싶어 하세요.`
        : `그중 ${koCount(k)} 분은 이 포지션에 직접 관심을 보이셨고, ${koCount(q)} 분은 지원 전에 하나씩 확인하고 싶어 하세요.`),
    // No "바로": Ashley answers on weekdays 09-21, and a person may take the thread.
    passOn: (q: number) => `이 메일에 답장 주시면 제가 ${q > 1 ? "그분들께" : "그분께"} 전해드릴게요.`,
    interestLead: (k: number, n: number) => (n === 1 ? "이분은 이 포지션에 직접 관심을 보이셨어요." : `그중 ${koCount(Math.max(1, k))} 분은 이 포지션에 직접 관심을 보이셨어요.`),
    heading: (n: number) => (n === 1 ? "어떤 분인지 짧게 정리하면 이래요." : "맞는 분들을 짧게 정리하면 이래요."),
    interestedMark: " (직접 관심)",
    unnamed: (k: number) => `직접 관심을 보인 분이 ${koCount(Math.max(1, k))} 분 더 있어요`,
    names: "이름과 연락처는 연결을 요청하시면 후보에게 확인한 뒤 이어드려요.",
    open: (n: number) => `${n}명 자세히 보기`,
    questions: "궁금한 점은 이 메일에 답장 주셔도 돼요.",
    followupLead: (title: string, previous: number, k: number) =>
      `지난번에 ${title} 포지션에 맞는 분 ${previous}명을 소개드렸는데, 그 뒤로 직접 관심을 보인 분이 ${koCount(Math.max(1, k))} 분 더 생겨서 이어서 연락드려요.`,
    // No 를/을 after the quote: the right one depends on the question's last word.
    followupQuestion: (question: string) => `이분이 궁금해하시는 점이에요. ${quoted(question)} 답장 주시면 전해드릴게요.`,
    // "지난번 분들까지" was untrue once an earlier candidate dropped out (stopped, or no longer a fit).
    gathered: (n: number, grew: boolean) => (grew ? `지금까지 맞는 분 ${n}명을 여기에 모아뒀어요.` : `${n}명을 여기에 모아뒀어요.`),
    thanks: "감사합니다.",
    signOff: (sender: string) => [sender ? `${sender} 드림` : "", "Talent Partner, Harper · matchharper.com"],
  },
  en: {
    greeting: (company: string) => `Hi ${company} team,`,
    intro: (sender: string) => `I'm ${firstName(sender)} from Harper, where I help companies with their hiring.`,
    count: (_company: string, title: string, n: number) =>
      `I know of ${n === 1 ? "one person who'd" : `${n} people who'd`} fit your ${title} role, so I wanted to reach out.`,
    askLead: (k: number, q: number, n: number) => (n === 1
      ? "They're interested in the role directly and wanted to check one thing before applying:"
      : k <= 1
      ? "One of them is interested in the role directly and wanted to check one thing before applying:"
      : q <= 1
        ? `${capitalize(enCount(k))} of them are interested in the role directly, and one wanted to check one thing before applying:`
        : `${capitalize(enCount(k))} of them are interested in the role directly, and ${enCount(q)} wanted to check one thing each before applying:`),
    passOn: (q: number) => `If you reply to this email, I'll pass your ${q > 1 ? "answers" : "answer"} on.`,
    interestLead: (k: number, n: number) => (n === 1
      ? "They've shown direct interest in the role."
      : k <= 1
      ? "One of them has shown direct interest in the role."
      : `${capitalize(enCount(k))} of them have shown direct interest in the role.`),
    heading: (n: number) => (n === 1 ? "Here's a quick look at them:" : "Here's a quick look at who fits:"),
    interestedMark: " (interested)",
    unnamed: (k: number) => (k <= 1 ? "One more person has shown direct interest in the role" : `${capitalize(enCount(k))} more people have shown direct interest in the role`),
    names: "Names and contact details are shared once you request an intro and the candidate agrees.",
    open: (n: number) => (n === 1 ? "See the candidate" : `See all ${n} candidates`),
    questions: "If you have any questions, just reply to this email.",
    followupLead: (title: string, previous: number, k: number) =>
      `Last time I shared ${people(previous)} who fit your ${title} role. Since then, ${k <= 1 ? "one more person has" : `${enCount(k)} more people have`} shown direct interest, so I wanted to follow up.`,
    followupQuestion: (question: string) => `They'd also like to know: ${quoted(question)} If you reply, I'll pass it on.`,
    gathered: (n: number, grew: boolean) => (grew
      ? `I've put all ${n} candidates so far in one place.`
      : `I've put all ${n} candidates in one place.`),
    thanks: "Thanks,",
    signOff: (sender: string) => [sender, "Talent Partner, Harper · matchharper.com"],
  },
} as const;

/** One bullet as markdown: line 1 (+ the interested mark), line 2 and the S3 question on the next lines. */
function bullet(line: CompanyCandidateLine, copy: (typeof COPY)[CompanyMailLanguage], withQuestion: boolean): string {
  const head = `- ${escapeMarkdown(`${line.line1}${line.interested ? copy.interestedMark : ""}`)}`;
  const rest = [line.line2 ? escapeMarkdown(oneLine(line.line2, 200)) : "", withQuestion && line.question ? escapeMarkdown(copy.followupQuestion(line.question)) : ""]
    .filter(Boolean).map((text) => `  ${text}`);
  return [head, ...rest].join("\n");
}

/** The candidate list: the bullets, then the "한 분 더" line for interested candidates without a summary consent. */
function candidateList(input: CompanyMailCopyInput, copy: (typeof COPY)[CompanyMailLanguage]): string {
  const items = input.lines.map((line) => bullet(line, copy, input.variant === "S3"));
  if (input.unnamedInterested > 0 && input.variant !== "S3") items.push(`- ${escapeMarkdown(copy.unnamed(input.unnamedInterested))}`);
  // A loose list (a blank line between items), as the first mail shows its postings.
  return items.join("\n\n");
}

/** The fixed company mail (S1/S2/S3) as markdown, before the mail layout. */
export function companyMailMarkdown(input: CompanyMailCopyInput): string {
  const copy = COPY[input.language];
  const company = escapeMarkdown(oneLine(input.companyName, 120));
  const title = escapeMarkdown(oneLine(input.postingTitle, 120));
  const sender = input.senderName.trim();
  const n = Math.max(0, Math.floor(input.visible));
  const link = `[${escapeMarkdown(copy.open(n))}](${input.landingUrl})`;
  const closing = [escapeMarkdown(copy.thanks), paragraph(...copy.signOff(sender).map(escapeMarkdown)), gtmOptOutMarkdown(input.language, input.unsubscribeUrl)];
  if (input.variant === "S3") {
    const previous = Math.max(0, Math.floor(input.previousVisible ?? 0));
    const hiddenQuestions = (input.unnamedQuestions ?? []).map((question) => escapeMarkdown(copy.followupQuestion(question)));
    return [
      escapeMarkdown(copy.greeting(oneLine(input.companyName, 120))),
      escapeMarkdown(copy.followupLead(oneLine(input.postingTitle, 120), previous, input.interested)),
      candidateList(input, copy),
      ...hiddenQuestions,
      paragraph(escapeMarkdown(copy.gathered(n, n > previous)), link),
      ...closing,
    ].filter(Boolean).join("\n\n");
  }
  const questions = input.variant === "S1" ? (input.questions ?? []).filter((question) => question.trim()) : [];
  const middle = input.variant === "S1"
    ? [
      paragraph(copy.count(company, title, n), escapeMarkdown(copy.askLead(input.interested, questions.length, n))),
      ...questions.map((question) => escapeMarkdown(quoted(question))),
      escapeMarkdown(copy.passOn(questions.length)),
    ]
    : [paragraph(copy.count(company, title, n), escapeMarkdown(copy.interestLead(input.interested, n)))];
  return [
    paragraph(escapeMarkdown(copy.greeting(oneLine(input.companyName, 120))), sender ? escapeMarkdown(copy.intro(sender)) : ""),
    ...middle,
    escapeMarkdown(copy.heading(n)),
    candidateList(input, copy),
    paragraph(escapeMarkdown(copy.names), link),
    input.variant === "S2" ? escapeMarkdown(copy.questions) : "",
    ...closing,
  ].filter(Boolean).join("\n\n");
}

const MAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif";

/** Markdown in Harper's mail layout, with the same sans font as the first mail (render.ts). */
function layout(markdown: string): { html: string; text: string } {
  const rendered = renderReplyEmail(markdown, { audience: "company" });
  const html = rendered.html
    .replace('data-harper-email-body-container="true" style="', `data-harper-email-body-container="true" style="font-family:${MAIL_FONT};`);
  return { html, text: rendered.text };
}

/** The fixed company mail, ready to send. */
export function renderCompanyMail(input: CompanyMailCopyInput): { subject: string; html: string; text: string } {
  return { subject: companyMailSubject(input), ...layout(companyMailMarkdown(input)) };
}

/**
 * A company mail Ashley wrote with the thread's history (the company had replied): her plain paragraphs, then the
 * parts code adds to every mail (the link line, thanks, the sign-off, the opt-out line), in the thread ("Re: …").
 */
export function renderWrittenCompanyMail(input: {
  language: CompanyMailLanguage; previousSubject: string; body: string; visible: number; senderName: string;
  landingUrl: string; unsubscribeUrl: string | null;
}): { subject: string; html: string; text: string } {
  const copy = COPY[input.language];
  const body = input.body.split(/\n{2,}/).map((part) => part.split("\n").map((line) => escapeMarkdown(line.trim())).filter(Boolean).join("\n"))
    .filter(Boolean);
  const markdown = [
    ...body,
    `[${escapeMarkdown(copy.open(Math.max(0, Math.floor(input.visible))))}](${input.landingUrl})`,
    escapeMarkdown(copy.thanks),
    paragraph(...copy.signOff(input.senderName.trim()).map(escapeMarkdown)),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].join("\n\n");
  return { subject: replySubject(input.previousSubject), ...layout(markdown) };
}
