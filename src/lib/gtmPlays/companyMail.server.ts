import "server-only";

import {
  CARD_OPEN,
  candidateDigestActionRowHtml,
  candidateDigestActionRowText,
} from "@/lib/companyFirstSearch/candidateDigestEmail";
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { gtmMailLinkOrigin, gtmOptOutMarkdown, type AnonymousCard } from "./shared";

/** #2 sends candidate cards for one posting; #3 tells a company that Harper members applied to it. */
export type GtmMailCampaign = "pool" | "demand";

export type GtmCompanyMailInput = {
  campaign: GtmMailCampaign;
  language: "ko" | "en";
  subject: string;
  /** The opening Chris edits; Markdown is allowed. Cards, buttons and the sign-off come after it. */
  intro: string;
  /** #2 only, in the order shown. */
  cards: AnonymousCard[];
  postingTitle: string | null;
  /** #3: the company's Role in /org (its waiting / to-request list); otherwise company signup. */
  ctaUrl?: string | null;
  senderName: string;
  senderEmail: string | null;
  /** The mail's own opt-out page (one click); null in previews. */
  unsubscribeUrl?: string | null;
  /**
   * #2: the mail's id, when it carries the posting: its buttons open /org?gtm=<id>, and signing up makes the
   * company a Role from that posting with these people in it (companyInvite.server.ts). Null in previews.
   */
  inviteId?: string | null;
};

const COPY = {
  ko: {
    cardsHeading: (title: string | null, count: number) =>
      title ? `${title}에 맞는 Harper 후보 ${count}명` : `Harper 후보 ${count}명`,
    meet: "후보 만나보기",
    // Not the product's "연결 요청": this button only opens Harper (company signup); nothing is requested.
    seeCandidate: "Harper에서 후보 보기",
    ask: "더 물어보기",
    closing: {
      pool: "궁금한 후보가 있으면 버튼을 누르시거나 이 메일에 답장해 주세요.",
      demand: "버튼을 누르시거나 이 메일에 답장해 주시면 자세히 안내해 드릴게요.",
    },
    signOff: (name: string) => `${name} 드림\nHarper`,
    candidate: (index: number) => `후보 ${index}`,
  },
  en: {
    cardsHeading: (title: string | null, count: number) =>
      title ? `${count} Harper candidates for ${title}` : `${count} Harper candidates`,
    meet: "Meet the candidates",
    seeCandidate: "See candidates on Harper",
    ask: "Ask a question",
    closing: {
      pool: "If anyone stands out, press a button or just reply to this email.",
      demand: "Press the button or reply to this email and I will share the details.",
    },
    signOff: (name: string) => `${name}\nHarper`,
    candidate: (index: number) => `Candidate ${index}`,
  },
} as const;

/**
 * Company self-serve signup (/org: sign in → create the workspace → onboarding; on while
 * COMPANY_SELF_SERVE_SIGNUP_ENABLED). The utm values say which play and card brought them. With the mail's id
 * (#2), signing up opens a Role made from the mail's posting instead of starting with onboarding.
 */
export function gtmCompanyCtaUrl(args: {
  campaign: GtmMailCampaign; language: "ko" | "en"; content?: string; inviteId?: string | null;
}) {
  const url = new URL("/org", gtmMailLinkOrigin());
  if (args.inviteId) url.searchParams.set("gtm", args.inviteId);
  url.searchParams.set("lang", args.language);
  url.searchParams.set("utm_source", "harper_gtm");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", `gtm_${args.campaign}`);
  if (args.content) url.searchParams.set("utm_content", args.content);
  return url.toString();
}

function askUrl(email: string | null, subject: string) {
  const to = email?.trim() || "chris@matchharper.com";
  return `mailto:${to}?subject=${encodeURIComponent(`Re: ${subject}`)}`;
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

const CARD_MARKER = (index: number) => `HARPERGTMCARD${index}X`;
const ACTION_MARKER = (index: number) => `HARPERGTMACTIONS${index}X`;

type Row = Parameters<typeof candidateDigestActionRowHtml>[0];

/**
 * The company mail in Harper's existing format: the shared email layout, candidate cards with the same
 * light fill, and the same filled + outlined buttons as the candidate digest.
 */
export function renderGtmCompanyMail(input: GtmCompanyMailInput) {
  const copy = COPY[input.language];
  const subject = input.subject.trim();
  const ask = { label: copy.ask, url: askUrl(input.senderEmail, subject) };
  const rows: Row[] = [];
  const blocks: string[] = [input.intro.trim()];

  if (input.campaign === "pool" && input.cards.length) {
    blocks.push(`### ${escapeMarkdown(copy.cardsHeading(input.postingTitle, input.cards.length))}`);
    input.cards.forEach((card, index) => {
      blocks.push(CARD_MARKER(rows.length));
      blocks.push(
        // Paragraphs keep their line breaks in Harper's mail layout (white-space: pre-line).
        `**${escapeMarkdown(`${copy.candidate(index + 1)} · ${card.title.trim()}`)}**${card.years.trim() ? `\n${escapeMarkdown(card.years.trim())}` : ""}`
      );
      // Cards can be edited by hand on the #2 screen: blank lines and spaces are dropped here.
      const highlights = card.highlights.map((line) => line.trim()).filter(Boolean);
      if (highlights.length) blocks.push(highlights.map((line) => `- ${escapeMarkdown(line)}`).join("\n"));
      if (card.fit.trim()) blocks.push(escapeMarkdown(card.fit.trim()));
      blocks.push(ACTION_MARKER(rows.length));
      rows.push({
        criteria: [],
        primary: {
          label: copy.seeCandidate,
          url: gtmCompanyCtaUrl({
            campaign: input.campaign, language: input.language, content: `card_${index + 1}`, inviteId: input.inviteId,
          }),
        },
        secondary: ask,
      });
    });
  } else {
    blocks.push(ACTION_MARKER(rows.length));
    rows.push({
      criteria: [],
      primary: { label: copy.meet, url: input.ctaUrl || gtmCompanyCtaUrl({ campaign: input.campaign, language: input.language }) },
      secondary: ask,
    });
  }
  blocks.push(copy.closing[input.campaign]);
  blocks.push(escapeMarkdown(copy.signOff(input.senderName)));
  // A first mail to someone who never signed up: one line on how to stop it (a link to the opt-out page).
  blocks.push(gtmOptOutMarkdown(input.language, input.unsubscribeUrl));

  const rendered = renderReplyEmail(blocks.filter(Boolean).join("\n\n"), { audience: "company" });
  let { html, text } = rendered;
  rows.forEach((row, index) => {
    const card = new RegExp(`<p[^>]*>${CARD_MARKER(index)}</p>`);
    const action = new RegExp(`<p[^>]*>${ACTION_MARKER(index)}</p>`);
    const inCard = card.test(html);
    if (!action.test(html) || !text.includes(ACTION_MARKER(index))) {
      throw new Error("GTM company mail buttons could not be placed");
    }
    // As in the candidate digest: the card opens before the candidate and closes after its buttons.
    if (inCard) html = html.replace(card, () => CARD_OPEN);
    html = html.replace(action, () => `${candidateDigestActionRowHtml(row)}${inCard ? "</div>" : ""}`);
    text = text.replace(CARD_MARKER(index), () => "────────────────────");
    text = text.replace(ACTION_MARKER(index), () => candidateDigestActionRowText(row));
  });
  return { subject, html, text };
}
