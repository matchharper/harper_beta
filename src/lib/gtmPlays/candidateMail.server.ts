import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  candidateDigestActionRowHtml,
  candidateDigestActionRowText,
} from "@/lib/companyFirstSearch/candidateDigestEmail";
import { parseCareerJobUrl } from "@/lib/career/jobLinkImport";
import { importCareerJobLink } from "@/lib/career/jobLinkImportServer";
import { renderReplyEmail } from "@/lib/email/runtime/format";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { GTM_WORKSPACE_ID, gtmWritesEnabled } from "./constants";
import { gtmRead } from "./db.server";
import { GTM_INVITE_VALID_MS } from "./invitePage.server";
import { gtmStructuredCall } from "./llm.server";
import {
  deliverGtmMail,
  gtmMailsTable,
  type GtmCandidateSource,
  type GtmMailSendResult,
  type GtmPostingSnapshot,
} from "./mailSend.server";
import { GtmWritesOffError } from "./outreach.server";
import {
  GTM_HARPER_ORIGIN,
  gtmMailLinkOrigin,
  cleanGtmKeywords,
  firstGtmEmail,
  gtmOptOutMarkdown,
  type GtmEnvelope,
} from "./shared";

/**
 * #4 후보 메일: one mail per chosen person, from any of three sources —
 *   Choice 1 member   Harper members (the member search; email from their Harper account)
 *   Choice 2 external people the external search found for the GTM Role (email the lookup found)
 *   Choice 3 scraped  the scraped profile DB (`candid`, only rows that carry an email)
 * The mail is a short note from the sender (replies come back to them) with a Harper button. That button's
 * link carries the mail's id: when the person opens Harper from it and signs in (new or existing account),
 * the posting is put in their inbox with the same import a pasted job link uses (importCareerJobLink).
 */

export type GtmRecipientRef = { source: GtmCandidateSource; ref: string };

export type GtmRecipient = GtmRecipientRef & {
  name: string | null;
  headline: string | null;
  email: string | null;
  /** Why this person can't get the mail (no email yet, …); null when they can. */
  problem: string | null;
};

export type ScrapedPerson = {
  ref: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  years: number | null;
  linkedinUrl: string | null;
  email: string;
  /** How many of the keywords matched (headline counts double). */
  score: number;
};

const SCRAPED_LIMIT = 50;
const CLAIM_VALID_MS = GTM_INVITE_VALID_MS;

/**
 * Choice 3: people in the scraped profile DB whose headline or summary contains any keyword (phrases, case
 * insensitive), among the ~22K rows with an email. One scan of `candid` (no text index: about 2-3 s).
 */
export async function searchScrapedPeople(args: { keywords: string[]; koreanOnly: boolean }) {
  const keywords = [...new Set(args.keywords.map((item) => item.trim()).filter((item) => item.length >= 2))].slice(0, 6);
  if (!keywords.length) return { people: [] as ScrapedPerson[] };
  const patterns = keywords.map((item) => `%${item.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  const rows = await gtmRead((sql) => sql<Array<{
    id: string; name: string | null; headline: string | null; location: string | null; total_exp_months: number | null;
    linkedin_url: string | null; email: string; score: number;
  }>>`
    select id::text, name, headline, location, total_exp_months, linkedin_url, email,
      (select count(*) filter (where c.headline ilike p) * 2 + count(*) filter (where c.summary ilike p)
        from unnest(${patterns}::text[]) as p)::int as score
    from public.candid c
    where c.email like '%@%'
      and (c.headline ilike any(${patterns}::text[]) or c.summary ilike any(${patterns}::text[]))
      and (not ${args.koreanOnly}::boolean or c.is_korean is true)
      and coalesce(c.is_linkedin_deprecated, false) is false
    order by score desc, c.last_updated_at desc nulls last
    limit ${SCRAPED_LIMIT}::int
  `);
  // `email` is stored as a JSON list ('["a@b.com"]'): the first address is the one used.
  return {
    people: rows.flatMap((row): ScrapedPerson[] => {
      const email = firstGtmEmail(row.email);
      return email ? [{
        ref: row.id, name: row.name, headline: row.headline, location: row.location,
        years: row.total_exp_months === null ? null : Math.round(row.total_exp_months / 12),
        linkedinUrl: row.linkedin_url, email, score: Number(row.score),
      }] : [];
    }),
  };
}

/**
 * Choice 3 키워드: phrases people fit for this Role would write in their own LinkedIn headline or summary
 * (titles and core skills, English and Korean), so the scraped DB search starts without typing. One LLM call.
 */
export async function suggestScrapedKeywords(args: { roleTitle: string; description: string }) {
  const result = await gtmStructuredCall<{ keywords: string[] }>({
    label: "ops/gtm-plays:scraped-keywords",
    schemaName: "gtm_scraped_keywords",
    schema: {
      type: "object", additionalProperties: false, required: ["keywords"],
      properties: { keywords: { type: "array", items: { type: "string" } } },
    },
    system: [
      "You pick search phrases for finding candidates in a database of LinkedIn profiles of people in Korea.",
      "A profile matches when its headline or summary contains a phrase (case-insensitive substring), and more matched phrases rank higher.",
      "Return 6 phrases that people who could do this role write about themselves: job titles they would hold now (including the level just below the role) and the core function or domain, in English as LinkedIn titles are usually written, plus 1-2 Korean ones (e.g. 영업 총괄).",
      "Each phrase 1-3 words, no company names, no locations, no brackets, no seniority-only words like 'senior' alone. Prefer common wording over the posting's exact title.",
    ].join("\n"),
    user: [`Role: ${args.roleTitle}`, "Posting:", args.description.slice(0, 4_000)].join("\n"),
    maxTokens: 600,
  });
  return cleanGtmKeywords(Array.isArray(result.keywords) ? result.keywords.map(String) : []);
}

/**
 * Names and addresses for the chosen people, read on the server (the screen sends only source + ref):
 * members from their Harper account, external people from the email lookup on the GTM Role, scraped people
 * from `candid`.
 */
export async function resolveGtmRecipients(args: { roleId: string | null; recipients: GtmRecipientRef[] }): Promise<GtmRecipient[]> {
  const admin = getSupabaseAdmin();
  const ids = (source: GtmCandidateSource) => args.recipients.filter((item) => item.source === source).map((item) => item.ref);
  const [members, externals, scraped] = await Promise.all([
    ids("member").length
      ? admin.from("talent_users").select("user_id,name,headline,email").in("user_id", ids("member")).is("deleted_at", null)
        .returns<Array<{ user_id: string; name: string | null; headline: string | null; email: string | null }>>()
      : Promise.resolve({ data: [], error: null }),
    ids("external").length && args.roleId
      ? admin.from("external_candidates").select("id,name,headline,contact:external_candidate_contacts(email,status)")
        .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("role_id", args.roleId).in("id", ids("external"))
        .returns<Array<{ id: string; name: string | null; headline: string | null;
          contact: { email: string | null; status: string } | Array<{ email: string | null; status: string }> | null }>>()
      : Promise.resolve({ data: [], error: null }),
    ids("scraped").length
      ? admin.from("candid").select("id,name,headline,email").in("id", ids("scraped"))
        .returns<Array<{ id: string; name: string | null; headline: string | null; email: string | null }>>()
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [members, externals, scraped]) if (result.error) throw result.error;
  const memberBy = new Map((members.data ?? []).map((row) => [row.user_id, row]));
  const externalBy = new Map((externals.data ?? []).map((row) => [row.id, row]));
  const scrapedBy = new Map((scraped.data ?? []).map((row) => [row.id, row]));
  return args.recipients.map((item): GtmRecipient => {
    const clean = firstGtmEmail;
    if (item.source === "member") {
      const row = memberBy.get(item.ref);
      const email = clean(row?.email);
      return { ...item, name: row?.name ?? null, headline: row?.headline ?? null, email, problem: row ? (email ? null : "하퍼 계정에 메일이 없어요") : "회원을 찾지 못했어요" };
    }
    if (item.source === "external") {
      const row = externalBy.get(item.ref);
      const contact = Array.isArray(row?.contact) ? row?.contact[0] : row?.contact;
      const email = contact?.status === "found" ? clean(contact.email) : null;
      return { ...item, name: row?.name ?? null, headline: row?.headline ?? null, email,
        problem: !row ? "이 Role의 외부 후보가 아니에요" : email ? null : "이메일을 아직 못 찾았어요 (이메일 찾기)" };
    }
    const row = scrapedBy.get(item.ref);
    const email = clean(row?.email);
    return { ...item, name: row?.name ?? null, headline: row?.headline ?? null, email, problem: email ? null : "메일 주소가 없어요" };
  });
}

/** The posting link the button puts into the person's inbox: only links the job-link import can read. */
export function gtmImportablePostingUrl(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  try {
    parseCareerJobUrl(text);
    return /^https?:\/\//i.test(text) && !/^https?:\/\/(www\.)?matchharper\.com\//i.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** A posting on Harper's own job pages (matchharper.com/jobs/<slug>): Harper customers' published Roles. */
const HARPER_JOB_PAGE = /^https?:\/\/(?:www\.)?matchharper\.com\/jobs\/([a-z0-9][a-z0-9-]*)\/?(?:[?#].*)?$/i;

export function harperJobSlug(value: string | null | undefined) {
  return HARPER_JOB_PAGE.exec(value?.trim() ?? "")?.[1]?.toLowerCase() ?? null;
}

/**
 * What the mail's posting link leads to after the Harper button:
 *   inbox       a posting from outside: signing in puts it in the person's inbox (New opportunity)
 *   harper_job  a Harper job page (a customer's published Role): the button opens that page, and signing up
 *               from it starts that Role's own flow (as a visitor of the page does)
 *   none        no usable link: the button only brings them into Harper
 */
export type GtmPosting =
  | { kind: "inbox"; url: string }
  | { kind: "harper_job"; url: string; slug: string; companyName: string; roleTitle: string }
  | { kind: "none" };

export async function resolveGtmPosting(value: string | null | undefined): Promise<GtmPosting> {
  const slug = harperJobSlug(value);
  if (slug) {
    const { data, error } = await getSupabaseAdmin().from("official_jobs").select("slug,company_name,role_title")
      .eq("slug", slug).eq("is_published", true).maybeSingle();
    if (error) throw error;
    return data
      ? { kind: "harper_job", url: `${GTM_HARPER_ORIGIN}/jobs/${slug}`, slug, companyName: data.company_name, roleTitle: data.role_title }
      : { kind: "none" };
  }
  const url = gtmImportablePostingUrl(value);
  return url ? { kind: "inbox", url } : { kind: "none" };
}

/**
 * The Harper button, carrying this mail's id (the claim token): the Harper job page for a customer's
 * published Role, otherwise Harper's page for this mail's posting (/jobs/invite/<id>: the posting before
 * sign-up, then "Harper로 계속하기"). Real mails point at matchharper.com; a test mail points at the server
 * the Ops page runs on.
 */
export function gtmCandidateHarperUrl(mailId: string, origin: string = GTM_HARPER_ORIGIN, posting?: GtmPosting) {
  const url = new URL(posting?.kind === "harper_job" ? `/jobs/${posting.slug}` : `/jobs/invite/${mailId}`, origin);
  if (posting?.kind === "harper_job") url.searchParams.set("gtm", mailId);
  url.searchParams.set("utm_source", "harper_gtm");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", "gtm_outreach");
  return url.toString();
}

/** What the composer knows about the posting, kept on the mail for its Harper page (not for job pages). */
export type GtmPostingInput = { title: string; companyName: string | null; location: string | null; description: string };

function postingSnapshot(posting: GtmPosting, input: GtmPostingInput | null): GtmPostingSnapshot | null {
  if (!input || posting.kind === "harper_job") return null;
  return {
    title: input.title.trim().slice(0, 200),
    companyName: input.companyName?.trim().slice(0, 200) || null,
    location: input.location?.trim().slice(0, 200) || null,
    description: input.description.trim().slice(0, 12_000),
    url: posting.kind === "inbox" ? posting.url : null,
  };
}

export type GtmCandidateMailDraft = { subject: string; body: string };

/** One LLM call: subject and body for everyone chosen (the greeting with each name is added by code). */
export async function draftGtmCandidateMail(args: {
  language: "ko" | "en"; companyName: string | null; roleTitle: string; description: string; senderName: string;
  postingUrl?: string | null;
}): Promise<GtmCandidateMailDraft> {
  // A Harper job page names the company the way the customer chose to appear in public (often not by name):
  // the mail uses that name and title, so it says no more than the page the button opens.
  const posting = await resolveGtmPosting(args.postingUrl);
  const publicJob = posting.kind === "harper_job" ? posting : null;
  return gtmStructuredCall<GtmCandidateMailDraft>({
    label: "ops/gtm-plays:candidate-mail",
    schemaName: "gtm_candidate_mail",
    schema: {
      type: "object", additionalProperties: false, required: ["subject", "body"],
      properties: { subject: { type: "string" }, body: { type: "string" } },
    },
    system: [
      "You write a short first email from a person at Harper (an AI recruiting service) to a candidate about one open role.",
      `Language: ${args.language === "ko" ? "Korean (polite 해요체)" : "English"}. Plain text, no greeting line (it is added per person), no sign-off (added by code).`,
      "body: 3~5 short sentences: who is writing (the sender, at Harper), the role and company in one line, what the role needs in one or two lines, and that they can see the posting on Harper with the button below or simply reply to this email (a résumé is welcome).",
      "Say only what the posting says; no salary or promises it does not make. subject: under 60 characters, the role and company.",
      ...(publicJob ? [
        `The company is not named in public: call it exactly "${publicJob.companyName}" and never use any other company name, product name or customer name from the posting.`,
      ] : []),
    ].join("\n"),
    user: [
      `Sender: ${args.senderName}`,
      `Company: ${publicJob?.companyName ?? args.companyName ?? "(not given)"}`,
      `Role: ${publicJob?.roleTitle ?? args.roleTitle}`,
      "Posting:",
      args.description.slice(0, 6_000),
    ].join("\n"),
    maxTokens: 900,
  });
}

const COPY = {
  ko: {
    greeting: (name: string | null) => (name ? `${name}님, 안녕하세요.` : "안녕하세요."),
    open: "Harper에서 공고 보기",
    posting: "공고 원문 보기",
    reply: "답장하기",
    signOff: (name: string) => `${name} 드림\nHarper`,
    harperNote: {
      inbox: "버튼을 누르면 Harper에서 공고를 먼저 보실 수 있고, 가입하시면 이 공고가 내 기회에 담겨요.",
      harper_job: "버튼을 누르면 Harper에서 공고를 보고, 가입해서 바로 이 공고로 이어 가실 수 있어요.",
      none: "버튼을 누르면 Harper에서 공고를 보고 가입하실 수 있어요. 가입하시면 맞는 공고를 계속 찾아 드려요.",
    },
  },
  en: {
    greeting: (name: string | null) => (name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,"),
    open: "See the role on Harper",
    posting: "Original posting",
    reply: "Reply",
    signOff: (name: string) => `${name}\nHarper`,
    harperNote: {
      inbox: "The button shows you the role on Harper first; sign up and it will be waiting in your opportunities.",
      harper_job: "The button opens the role on Harper, where you can sign up and go straight on with it.",
      none: "The button shows you the role on Harper; sign up and Harper will keep finding roles that fit you.",
    },
  },
} as const;

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_[\]<>#|~]/g, "\\$&");
}

const ACTION_MARKER = "HARPERGTMCANDIDATEACTIONSX";

/**
 * The lines under the buttons, before the opt-out line: what the button does and the sign-off. Chris can
 * rewrite them per mail; the opt-out line is always added by code.
 */
export function gtmCandidateClosing(language: "ko" | "en", kind: GtmPosting["kind"], senderName: string) {
  const copy = COPY[language];
  return `${copy.harperNote[kind]}\n\n${copy.signOff(senderName)}`;
}

/** The candidate mail in Harper's mail layout: greeting, the body, the two buttons, closing lines, opt-out line. */
export function renderGtmCandidateMail(input: {
  language: "ko" | "en"; subject: string; body: string; name: string | null; harperUrl: string;
  posting: GtmPosting; senderName: string; senderEmail: string; unsubscribeUrl?: string | null;
  /** Chris's own lines under the buttons; empty or missing: gtmCandidateClosing. */
  closing?: string | null;
}) {
  const copy = COPY[input.language];
  const closing = input.closing?.trim() || gtmCandidateClosing(input.language, input.posting.kind, input.senderName);
  const subject = input.subject.trim();
  // A Harper job page is already what the first button opens; an outside posting gets its own button.
  const row = {
    criteria: [],
    primary: { label: copy.open, url: input.harperUrl },
    secondary: input.posting.kind === "inbox"
      ? { label: copy.posting, url: input.posting.url }
      : { label: copy.reply, url: `mailto:${input.senderEmail}?subject=${encodeURIComponent(`Re: ${subject}`)}` },
  };
  const markdown = [
    escapeMarkdown(copy.greeting(input.name?.trim() || null)),
    input.body.trim(),
    ACTION_MARKER,
    escapeMarkdown(closing),
    gtmOptOutMarkdown(input.language, input.unsubscribeUrl),
  ].filter(Boolean).join("\n\n");
  const rendered = renderReplyEmail(markdown, { audience: "talent" });
  const marker = new RegExp(`<p[^>]*>${ACTION_MARKER}</p>`);
  if (!marker.test(rendered.html) || !rendered.text.includes(ACTION_MARKER)) {
    throw new Error("GTM candidate mail buttons could not be placed");
  }
  return {
    subject,
    html: rendered.html.replace(marker, () => candidateDigestActionRowHtml(row)),
    text: rendered.text.replace(ACTION_MARKER, () => candidateDigestActionRowText(row)),
  };
}

export type GtmCandidateSendResult = GtmRecipient & { result: GtmMailSendResult | { status: "skipped"; reason: string } };

/**
 * Sends one mail per chosen person (in order), each through the shared GTM sender: suppression list, one mail
 * per address and Role in 30 days, logged in gtm_mails with the person's source.
 */
export async function sendGtmCandidateMails(args: {
  user: User; envelope: GtmEnvelope; recipients: GtmRecipientRef[]; language: "ko" | "en"; subject: string; body: string;
  roleId: string | null; gtmRoleId: string | null; companyName: string | null; postingUrl: string | null;
  posting: GtmPostingInput | null; closing?: string | null;
}): Promise<GtmCandidateSendResult[]> {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
  const people = await resolveGtmRecipients({ roleId: args.gtmRoleId, recipients: args.recipients });
  const posting = await resolveGtmPosting(args.postingUrl);
  const postingUrl = posting.kind === "none" ? null : posting.url;
  const snapshot = postingSnapshot(posting, args.posting);
  const results: GtmCandidateSendResult[] = [];
  for (const person of people) {
    if (!person.email) {
      results.push({ ...person, result: { status: "skipped", reason: person.problem ?? "메일 주소가 없어요" } });
      continue;
    }
    try {
      const result = await deliverGtmMail({
        user: args.user,
        envelope: args.envelope,
        to: person.email,
        facts: {
          campaign: "outreach", audience: "candidate", company_name: args.companyName,
          company_workspace_id: null, role_id: args.roleId, posting_url: postingUrl,
          candidate_source: person.source, candidate_ref: person.ref,
          talent_ids: person.source === "member" ? [person.ref] : [], language: args.language, posting: snapshot,
        },
        render: (id, links) => renderGtmCandidateMail({
          language: args.language, subject: args.subject, body: args.body, name: person.name,
          harperUrl: gtmCandidateHarperUrl(id, gtmMailLinkOrigin(), posting), posting,
          senderName: args.envelope.fromName, senderEmail: args.envelope.fromEmail, unsubscribeUrl: links.unsubscribeUrl,
          closing: args.closing,
        }),
      });
      results.push({ ...person, result });
    } catch (error) {
      results.push({ ...person, result: { status: "skipped", reason: error instanceof Error ? error.message : String(error) } });
    }
  }
  return results;
}

export type GtmClaimResult =
  | { status: "imported"; roleId: string; recommendationId: string }
  | { status: "no_posting" | "unavailable" | "not_found" | "expired" };

/**
 * When someone opens Harper from a candidate mail's button and is signed in: the mail's posting goes into
 * their inbox (a New opportunity, as when Harper finds a posting for them). Anyone who opens the link gets
 * it; the first person is kept on the mail row.
 */
export async function claimGtmCandidateMail(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>; userId: string; mailId: string; locale: "ko" | "en";
}): Promise<GtmClaimResult> {
  const table = gtmMailsTable(args.admin as unknown as ReturnType<typeof getSupabaseAdmin>);
  const { data, error } = await table.select("id,audience,status,posting_url,created_at,claimed_talent_id")
    .eq("id", args.mailId).maybeSingle();
  if (error) throw error;
  const mail = data as { id: string; audience: string; status: string; posting_url: string | null; created_at: string;
    claimed_talent_id: string | null } | null;
  if (!mail || mail.audience !== "candidate" || mail.status !== "sent") return { status: "not_found" };
  if (Date.now() - Date.parse(mail.created_at) > CLAIM_VALID_MS) return { status: "expired" };
  // A Harper job page carries on with that Role's own flow (its page and signup); only outside postings are
  // imported here. Either way the mail row keeps who came in from it.
  const postingUrl = gtmImportablePostingUrl(mail.posting_url);
  let imported: Awaited<ReturnType<typeof importCareerJobLink>> | null = null;
  let unavailable = false;
  if (postingUrl) {
    try {
      imported = await importCareerJobLink({
        admin: args.admin, talentId: args.userId, url: postingUrl, savedStage: null, preserveExistingProgress: true,
        locale: args.locale,
      });
    } catch (error) {
      // The posting closed, the company is one they blocked, or the page can no longer be read: nothing to
      // add, and trying again on the next visit would not change that.
      const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      if (!/closed|unavailable|blocked|Test-only|job_details_required/i.test(message)) throw error;
      unavailable = true;
    }
  }
  if (!mail.claimed_talent_id) {
    const { error: claimError } = await table.update({
      claimed_talent_id: args.userId, claimed_recommendation_id: imported?.recommendationId ?? null,
      claimed_at: new Date().toISOString(),
    }).eq("id", mail.id).is("claimed_talent_id", null);
    if (claimError) console.error("[gtm-plays] claimed but the mail row was not updated", mail.id, claimError);
  }
  if (imported) return { status: "imported", roleId: imported.roleId, recommendationId: imported.recommendationId };
  return { status: unavailable ? "unavailable" : "no_posting" };
}
