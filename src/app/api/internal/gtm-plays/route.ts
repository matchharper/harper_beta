import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { draftGtmBrief } from "@/lib/gtmPlays/brief.server";
import { GTM_WORKSPACE_ID, gtmWritesEnabled } from "@/lib/gtmPlays/constants";
import { findCompanyContacts } from "@/lib/gtmPlays/contacts.server";
import {
  draftDemandMail,
  listApplyFunnel,
  listCompanyApplications,
  listCustomerDemand,
  loadCandidatePagePreview,
  loadDemandCompany,
  loadDemandRole,
} from "@/lib/gtmPlays/demand.server";
import { jdFromText, listCustomerRoles, readCustomerRoleJd, readJdFromUrl, type GtmJd } from "@/lib/gtmPlays/jd.server";
import {
  GtmWritesOffError,
  copyToCustomerRole,
  createGtmRole,
  findGtmRoleForJd,
  listGtmRoles,
  loadGtmRole,
  passGtmCandidate,
  previewGtmInvite,
  requestGtmEmail,
  requestGtmSearch,
  saveGtmBrief,
  searchDraftMembers,
  searchGtmMembers,
  sendGtmIntro,
  setGtmRoleOpen,
} from "@/lib/gtmPlays/outreach.server";
import { renderGtmCompanyMail } from "@/lib/gtmPlays/companyMail.server";
import {
  draftGtmCandidateMail,
  gtmCandidateClosing,
  gtmCandidateHarperUrl,
  renderGtmCandidateMail,
  resolveGtmPosting,
  resolveGtmRecipients,
  searchScrapedPeople,
  sendGtmCandidateMails,
  suggestScrapedKeywords,
} from "@/lib/gtmPlays/candidateMail.server";
import { gtmUnsubscribeUrl, listGtmMails, sendGtmCompanyMail } from "@/lib/gtmPlays/mailSend.server";
import { GTM_DEFAULT_ENVELOPE, GTM_MAX_CC } from "@/lib/gtmPlays/shared";
import {
  POOL_CARD_LIMIT,
  draftPoolMail,
  findInternalMatches,
  writeAnonymousCards,
} from "@/lib/gtmPlays/pool.server";

export const runtime = "nodejs";
export const maxDuration = 300;

const uuid = z.string().uuid();
/** Previews show the mail's links with this id (their buttons cannot be followed). */
const PREVIEW_MAIL_ID = "00000000-0000-0000-0000-000000000000";
const language = z.enum(["ko", "en"]).default("ko");
const days = z.coerce.number().int().min(1).max(365).default(90);
/** #3: the /org numbers are current; the period only bounds the careers-site postings line in the fold. */
const demandQuery = z.object({ days });

const jdSchema = z.object({
  source: z.enum(["customer_role", "url", "text"]),
  companyName: z.string().max(200),
  title: z.string().max(200),
  description: z.string().max(20_000),
  url: z.string().max(2_000).nullable(),
  location: z.string().max(300).nullable(),
  sourceRoleId: uuid.nullable(),
  sourceWorkspaceId: uuid.nullable(),
  contactEmails: z.array(z.string().max(320)).max(10),
});

const briefSchema = z.object({
  roleName: z.string().trim().min(1).max(160),
  request: z.string().trim().min(1).max(4_000),
  criteria: z.array(z.object({
    id: z.string().max(40).optional(),
    name: z.string().trim().min(1).max(80),
    criteria: z.string().trim().min(1).max(400),
    requirement: z.enum(["must", "preferred"]).optional(),
    importance: z.number().int().min(1).max(3).optional(),
  })).max(8),
});

const cardSchema = z.object({
  talentId: uuid, title: z.string().max(120), years: z.string().max(40),
  highlights: z.array(z.string().max(200)).max(3), fit: z.string().max(300),
});

const text = (max: number) => z.string().max(max).nullable();
/** A member row as pool.match returned it; sent back for the ones Chris picked. */
const memberSchema = z.object({
  talentId: uuid,
  name: text(200), headline: text(500), location: text(300),
  years: z.number().min(0).max(80).nullable(),
  similarity: z.number(),
  experiences: z.array(z.object({
    role: text(300), company: text(300), start: text(40), end: text(40), description: text(600),
  })).max(6),
  educations: z.array(z.object({ school: text(300), degree: text(300), field: text(300) })).max(3),
});

/** A link into Harper only (the company's Role in /org, or signup). */
const harperUrl = z.string().trim().max(2_000).refine((value) => /^https:\/\/matchharper\.com\//.test(value), "Harper 주소만 돼요.");

const mailSchema = z.object({
  campaign: z.enum(["pool", "demand"]),
  language,
  subject: z.string().trim().min(1).max(300),
  intro: z.string().max(4_000),
  cards: z.array(cardSchema).max(POOL_CARD_LIMIT).default([]),
  postingTitle: z.string().max(200).nullable().default(null),
  ctaUrl: harperUrl.nullable().default(null),
});

/** Sender (any matchharper.com address, Chris by default) and CC, on every mail form. */
const envelopeSchema = z.object({
  fromName: z.string().trim().min(1).max(80),
  fromEmail: z.string().trim().max(320),
  cc: z.array(z.string().trim().max(320)).max(GTM_MAX_CC).default([]),
});

/** #4 후보 메일: who (source + ref; names and addresses are read on the server) and what. */
const recipientList = z.array(z.object({
  source: z.enum(["member", "external", "scraped"]), ref: z.string().trim().min(1).max(64),
})).max(100);

const candidateMailSchema = z.object({
  envelope: envelopeSchema,
  language,
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4_000),
  postingUrl: z.string().trim().max(2_000).nullable().default(null),
  /** The lines under the buttons (null or empty: the default for the posting and sender). */
  closing: z.string().max(1_000).nullable().default(null),
});

/** The posting the mail is about, shown on Harper's page for the mail before sign-up. */
const postingInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  companyName: z.string().trim().max(200).nullable().default(null),
  location: z.string().trim().max(300).nullable().default(null),
  description: z.string().max(20_000),
}).nullable().default(null);

const jdInput = z.discriminatedUnion("source", [
  z.object({ source: z.literal("customer_role"), roleId: uuid }),
  z.object({ source: z.literal("url"), url: z.string().trim().url().max(2_000) }),
  z.object({
    source: z.literal("text"), companyName: z.string().trim().min(1).max(200), title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(20).max(20_000), url: z.string().trim().max(2_000).optional(),
  }),
]);

async function readJd(input: z.infer<typeof jdInput>): Promise<GtmJd> {
  if (input.source === "customer_role") return readCustomerRoleJd(input.roleId);
  if (input.source === "url") return readJdFromUrl(input.url);
  return jdFromText({ companyName: input.companyName, title: input.title, text: input.text, url: input.url });
}

type Handler = (data: unknown, user: User) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  config: async () => ({ writes: gtmWritesEnabled(), gtmWorkspaceId: GTM_WORKSPACE_ID }),

  "jd.customerRoles": async () => ({ roles: await listCustomerRoles() }),
  "jd.read": async (data) => ({ jd: await readJd(jdInput.parse(data)) }),
  "brief.draft": async (data) => ({ brief: await draftGtmBrief(z.object({ jd: jdSchema }).parse(data).jd) }),

  "outreach.roles": async () => ({ roles: await listGtmRoles() }),
  "outreach.role": async (data) => ({ role: await loadGtmRole(z.object({ roleId: uuid }).parse(data).roleId) }),
  /** Saves the JD + search criteria as one GTM Role; the same posting reopens the Role made before. */
  "outreach.createRole": async (data, user) => {
    const input = z.object({ jd: jdSchema, brief: briefSchema, extraRequest: z.string().max(2_000).default("") }).parse(data);
    return createGtmRole({ user, ...input });
  },
  /** The GTM Role already made for this posting, read only. */
  "outreach.findRole": async (data) => ({ role: await findGtmRoleForJd(z.object({ jd: jdSchema }).parse(data).jd) }),
  /** 우리 DB 검색 before the Role is saved, read only. */
  "outreach.internalDraft": async (data) =>
    searchDraftMembers(z.object({ jd: jdSchema, brief: briefSchema, extraRequest: z.string().max(2_000).default("") }).parse(data)),
  /** 끝내기 (ended) / 다시 열기 (active). */
  "outreach.setOpen": async (data, user) => setGtmRoleOpen({ user, ...z.object({ roleId: uuid, open: z.boolean() }).parse(data) }),
  "outreach.saveBrief": async (data, user) => {
    const input = z.object({
      roleId: uuid,
      request: z.string().trim().min(1).max(4_000),
      extraRequest: z.string().max(2_000).default(""),
      criteria: briefSchema.shape.criteria,
    }).parse(data);
    return saveGtmBrief({ user, ...input });
  },
  /** Harper members for one Role, read only (works with writes off). */
  "outreach.internal": async (data) => searchGtmMembers(z.object({ roleId: uuid }).parse(data).roleId),
  "outreach.search": async (data, user) => requestGtmSearch({ user, ...z.object({ roleId: uuid }).parse(data) }),
  "outreach.email": async (data, user) =>
    requestGtmEmail({ user, ...z.object({ roleId: uuid, candidateId: uuid }).parse(data) }),
  "outreach.pass": async (data, user) =>
    passGtmCandidate({ user, ...z.object({ roleId: uuid, candidateId: uuid, reason: z.string().max(500).default("") }).parse(data) }),
  "outreach.invitePreview": async (data) =>
    ({ invite: await previewGtmInvite(z.object({ roleId: uuid, candidateId: uuid, appeal: z.string().max(2_000).default("") }).parse(data)) }),
  "outreach.intro": async (data, user) => {
    const input = z.object({
      roleId: uuid, candidateId: uuid, appeal: z.string().trim().min(1).max(2_000),
      recipients: z.array(z.string().trim().toLowerCase().email()).min(1).max(10),
    }).parse(data);
    return sendGtmIntro({ user, ...input });
  },
  "outreach.copy": async (data, user) => copyToCustomerRole({
    user, ...z.object({ roleId: uuid, candidateIds: z.array(uuid).min(1).max(20), targetRoleId: uuid }).parse(data),
  }),

  /** #4 Choice 3: people in the scraped profile DB with an email, by keyword. Read only. */
  "candidates.scraped": async (data) => searchScrapedPeople(z.object({
    keywords: z.array(z.string().trim().max(80)).min(1).max(6), koreanOnly: z.boolean().default(true),
  }).parse(data)),
  /** Choice 3 on open: keywords written from the Role (LLM 1회), then the same search. */
  "candidates.scrapedAuto": async (data) => {
    const input = z.object({
      roleTitle: z.string().trim().min(1).max(200), description: z.string().max(20_000), koreanOnly: z.boolean().default(true),
    }).parse(data);
    const keywords = await suggestScrapedKeywords(input);
    const found = keywords.length ? await searchScrapedPeople({ keywords, koreanOnly: input.koreanOnly }) : { people: [] };
    return { keywords, ...found };
  },
  /** Names, addresses and what blocks each chosen person, for the 후보 메일 list. Read only. */
  "candidates.resolve": async (data) => ({
    recipients: await resolveGtmRecipients(z.object({ roleId: uuid.nullable().default(null), recipients: recipientList }).parse(data)),
  }),
  "candidates.draft": async (data) => ({
    draft: await draftGtmCandidateMail(z.object({
      language, companyName: z.string().trim().max(200).nullable().default(null), roleTitle: z.string().trim().min(1).max(200),
      description: z.string().max(20_000), senderName: z.string().trim().min(1).max(80),
      postingUrl: z.string().trim().max(2_000).nullable().default(null),
    }).parse(data)),
  }),
  /** The mail as the first chosen person gets it, and whether its posting link can go into an inbox. */
  "candidates.render": async (data) => {
    const input = candidateMailSchema.extend({ name: z.string().max(120).nullable().default(null) }).parse(data);
    const posting = await resolveGtmPosting(input.postingUrl);
    return {
      mail: renderGtmCandidateMail({
        language: input.language, subject: input.subject, body: input.body, name: input.name,
        harperUrl: gtmCandidateHarperUrl(PREVIEW_MAIL_ID, undefined, posting), posting,
        senderName: input.envelope.fromName, senderEmail: input.envelope.fromEmail,
        unsubscribeUrl: gtmUnsubscribeUrl(PREVIEW_MAIL_ID), closing: input.closing,
      }),
      posting: posting.kind,
      // What the closing box shows until Chris writes his own.
      defaultClosing: gtmCandidateClosing(input.language, posting.kind, input.envelope.fromName),
    };
  },
  "candidates.send": async (data, user) => {
    const input = candidateMailSchema.extend({
      recipients: recipientList.min(1),
      roleId: uuid.nullable().default(null),
      gtmRoleId: uuid.nullable().default(null),
      companyName: z.string().trim().max(200).nullable().default(null),
      posting: postingInputSchema,
    }).parse(data);
    return { results: await sendGtmCandidateMails({ user, ...input }) };
  },
  "demand.list": async (data) => listCustomerDemand(demandQuery.parse(data)),
  "demand.company": async (data) => ({ detail: await loadDemandCompany(demandQuery.extend({ workspaceId: uuid }).parse(data)) }),
  "demand.role": async (data) => ({ detail: await loadDemandRole(z.object({ workspaceId: uuid, roleId: uuid }).parse(data)) }),
  /** The mail opening for one Role (or the whole company): the numbers sentence is written by code. */
  "demand.mail": async (data) => {
    const input = demandQuery.extend({ workspaceId: uuid, roleId: uuid.nullable().default(null), language }).parse(data);
    return { draft: await draftDemandMail(input) };
  },
  "contacts.find": async (data) => {
    const input = z.object({ companyName: z.string().trim().min(1).max(200), homepageUrl: z.string().max(500).nullable() }).parse(data);
    return { contacts: await findCompanyContacts(input) };
  },
  /** The mail exactly as the company would get it (Harper's mail format), for the preview. */
  "mail.render": async (data) => {
    const input = mailSchema.extend({ envelope: envelopeSchema.default(GTM_DEFAULT_ENVELOPE) }).parse(data);
    const { envelope, ...content } = input;
    return {
      mail: renderGtmCompanyMail({
        ...content, senderName: envelope.fromName, senderEmail: envelope.fromEmail, unsubscribeUrl: gtmUnsubscribeUrl(PREVIEW_MAIL_ID),
      }),
    };
  },
  /** Sends what the preview shows: refused for opted-out/bounced addresses and repeats within 30 days; logged. */
  "mail.send": async (data, user) => {
    const input = mailSchema.extend({
      envelope: envelopeSchema,
      to: z.string().trim().min(3).max(320),
      companyName: z.string().trim().max(200).nullable().default(null),
      companyWorkspaceId: uuid.nullable().default(null),
      roleId: uuid.nullable().default(null),
      postingUrl: z.string().trim().max(2_000).nullable().default(null),
      // #2: the JD the cards were picked for (the Role made when the company signs up from the mail).
      posting: z.object({
        title: z.string().trim().min(1).max(200),
        companyName: z.string().trim().max(200).nullable().default(null),
        location: z.string().trim().max(300).nullable().default(null),
        description: z.string().max(20_000),
        url: z.string().trim().max(2_000).nullable().default(null),
      }).nullable().default(null),
    }).parse(data);
    const { envelope, to, companyName, companyWorkspaceId, roleId, postingUrl, posting, ...content } = input;
    return sendGtmCompanyMail({ user, envelope, to, content, companyName, companyWorkspaceId, roleId, postingUrl, posting });
  },
  "mail.history": async (data) => {
    const input = z.object({
      to: z.string().trim().max(320).nullable().default(null),
      companyName: z.string().trim().max(200).nullable().default(null),
      roleId: uuid.nullable().default(null),
      audience: z.enum(["company", "candidate"]).optional(),
    }).parse(data);
    return listGtmMails(input);
  },

  "pool.match": async (data) => {
    const input = z.object({ jd: jdSchema }).parse(data);
    return findInternalMatches({ jd: input.jd });
  },
  "pool.cards": async (data) => {
    const input = z.object({ jd: jdSchema, members: z.array(memberSchema).min(1).max(POOL_CARD_LIMIT), language }).parse(data);
    return { cards: await writeAnonymousCards(input) };
  },
  "pool.mail": async (data) => {
    const input = z.object({ jd: jdSchema, cardCount: z.number().int().min(1).max(POOL_CARD_LIMIT), language }).parse(data);
    return { draft: await draftPoolMail(input) };
  },

  "funnel.list": async (data) => ({ companies: await listApplyFunnel(z.object({ days: days.default(30) }).parse(data)) }),
  "funnel.applications": async (data) => listCompanyApplications(z.object({ workspaceId: uuid, days: days.default(30) }).parse(data)),
  "funnel.candidate": async (data) => ({ preview: await loadCandidatePagePreview(z.object({ talentId: uuid }).parse(data).talentId) }),
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireInternalApiUser(request);
    const body = (await request.json().catch(() => null)) as { action?: unknown; data?: unknown } | null;
    const handler = typeof body?.action === "string" ? handlers[body.action] : undefined;
    if (!handler) return NextResponse.json({ error: "알 수 없는 action이에요." }, { status: 400 });
    const result = await handler(body?.data ?? {}, user);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GtmWritesOffError) return NextResponse.json({ error: error.message, writesOff: true }, { status: 409 });
    if (error instanceof z.ZodError) {
      // Name the field and the rule, so the screen says what to fix (e.g. "jd.description: …").
      const issue = error.issues[0];
      const where = issue ? ` (${issue.path.join(".") || "입력"}: ${issue.message})` : "";
      return NextResponse.json({ error: `입력값을 확인해 주세요${where}.`, issues: error.issues }, { status: 400 });
    }
    const billing = billingErrorResponse(error);
    if (billing) return billing;
    console.error("[internal/gtm-plays]", error);
    // Database errors are plain objects, not Error: show their message too (staff only), so the screen says why.
    if (!(error instanceof Error) && error && typeof error === "object" && "message" in error) {
      return NextResponse.json({ error: `요청을 처리하지 못했어요: ${String(error.message).slice(0, 300)}` }, { status: 500 });
    }
    return toInternalApiErrorResponse(error, "요청을 처리하지 못했어요.");
  }
}
