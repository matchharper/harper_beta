import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { draftGtmBrief } from "@/lib/gtmPlays/brief.server";
import { GTM_WORKSPACE_ID, gtmWritesEnabled } from "@/lib/gtmPlays/constants";
import { listApplyFunnel, listCompanyApplications, loadCandidatePagePreview } from "@/lib/gtmPlays/applyFunnel.server";
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
import { importRecruiterApplicants } from "@/lib/gtmPlays/agent/import.server";
import { readAgentSettings, saveAgentSettings } from "@/lib/gtmPlays/agent/store.server";
import {
  AgentActionError,
  agentFunnel,
  agentQueue,
  approveDraft,
  editDraft,
  listAgentPeople,
  listAgentRuns,
  markReplied,
  markSentByHand,
  readAgentTimeline,
  rejectDraft,
  skipPerson,
  startManualRun,
  stopAgent,
} from "@/lib/gtmPlays/agent/views.server";
import { listOutreachFunnel, listOutreachFunnelMails, readOutreachPosting } from "@/lib/gtmPlays/outreachFunnel.server";
import { draftGtmPersonalLines } from "@/lib/gtmPlays/personalLine.server";
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
import { gtmUnsubscribeUrl, listGtmMails, readGtmSendQuota } from "@/lib/gtmPlays/mailSend.server";
import { GTM_MAX_CC } from "@/lib/gtmPlays/shared";

export const runtime = "nodejs";
export const maxDuration = 300;

const uuid = z.string().uuid();
/** Previews show the mail's links with this id (their buttons cannot be followed). */
const PREVIEW_MAIL_ID = "00000000-0000-0000-0000-000000000000";
const language = z.enum(["ko", "en"]).default("ko");
const days = z.coerce.number().int().min(1).max(365).default(90);
/** #3: the /org numbers are current; the period only bounds the careers-site postings line in the fold. */

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
  publicDescription: z.string().trim().max(40).optional(),
  request: z.string().trim().min(1).max(4_000),
  criteria: z.array(z.object({
    id: z.string().max(40).optional(),
    name: z.string().trim().min(1).max(80),
    criteria: z.string().trim().min(1).max(400),
    requirement: z.enum(["must", "preferred"]).optional(),
    importance: z.number().int().min(1).max(3).optional(),
  })).max(8),
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

// #5 후보자 소싱 에이전트
const agentSourceSetting = z.object({ enabled: z.boolean(), daily: z.number().int().min(0).max(500) });
const agentChannelSetting = z.object({
  enabled: z.boolean(), account: z.string().trim().max(200).nullable().transform((value) => value || null),
  daily: z.number().int().min(0).max(200),
});
const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  senderName: z.string().trim().max(100).nullable().transform((value) => value || null),
  senderEmail: z.string().trim().toLowerCase().max(320).nullable().transform((value) => value || null)
    .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value), "메일 주소 형식이 아니에요."),
  dailyMailCap: z.number().int().min(0).max(500),
  dailyCostUsd: z.number().min(0).max(1_000),
  sendStartHour: z.number().int().min(0).max(23),
  sendEndHour: z.number().int().min(1).max(24),
  approvalRequired: z.boolean(),
  followupDays: z.number().int().min(1).max(60),
  quietDaysAfterEnd: z.number().int().min(0).max(365),
  ownDomainAllowed: z.boolean(),
  sources: z.object({ recruiter: agentSourceSetting, opentowork: agentSourceSetting, threads: agentSourceSetting }),
  channels: z.object({ linkedin: agentChannelSetting, x: agentChannelSetting, threads: agentChannelSetting }),
}).refine((value) => value.sendStartHour !== value.sendEndHour % 24, { message: "보내는 시간의 시작과 끝이 같아요.", path: ["sendEndHour"] })
  .refine((value) => !value.enabled || (value.senderName && value.senderEmail), {
    message: "켜려면 보내는 사람 이름과 메일 주소가 필요해요.", path: ["senderEmail"],
  });
const agentStatus = z.enum(["found", "excluded", "no_fit", "matched", "drafted", "approved", "sent", "queued_human", "skipped", "replied", "ended", "failed"]);
const agentSource = z.enum(["recruiter", "opentowork", "threads", "manual"]);
const agentHumanChannel = z.enum(["linkedin", "x", "threads"]);
const includeTest = z.boolean().default(false);
/** #5 writes need the same switch as the other plays (sending, paid runs, records). */
function assertAgentWrites() {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
}

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
  /** #4 숫자 표: per Role, what the candidate mails of the period led to (also by source). Read only. */
  "outreach.funnel": async (data) => listOutreachFunnel(z.object({ days: days.default(30) }).parse(data)),
  /** One Role's candidate mails of the period, for the list under its row. Read only. */
  "outreach.funnelMails": async (data) =>
    listOutreachFunnelMails(z.object({ days: days.default(30), roleKey: z.string().trim().min(1).max(600) }).parse(data)),
  /** The posting a results row is about (what its mails showed, else the Role's JD), read when the row opens. */
  "outreach.posting": async (data) => ({
    posting: await readOutreachPosting(z.object({ roleKey: z.string().trim().min(1).max(600) }).parse(data)),
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
      /** A GTM Role's mail: the saved Role, or the company description on screen before it is saved. */
      gtm: z.object({ publicDescription: z.string().max(40).nullable().default(null), roleId: uuid.nullable().default(null) })
        .nullable().default(null),
    }).parse(data)),
  }),
  /** 맞춤 한 줄 for everyone chosen, from each person's own search result (LLM 1회). Read only. */
  "candidates.lines": async (data) => ({
    lines: await draftGtmPersonalLines(z.object({
      language, roleTitle: z.string().trim().min(1).max(200), companyName: z.string().trim().max(200).nullable().default(null),
      description: z.string().max(20_000), gtmRoleId: uuid.nullable().default(null), recipients: recipientList.min(1),
    }).parse(data)),
  }),
  /** The mail as the first chosen person gets it, and whether its posting link can go into an inbox. */
  "candidates.render": async (data) => {
    const input = candidateMailSchema.extend({
      name: z.string().max(120).nullable().default(null), personalLine: z.string().max(300).nullable().default(null),
    }).parse(data);
    const posting = await resolveGtmPosting(input.postingUrl);
    return {
      mail: renderGtmCandidateMail({
        language: input.language, subject: input.subject, body: input.body, name: input.name,
        harperUrl: gtmCandidateHarperUrl(PREVIEW_MAIL_ID, undefined, posting), posting,
        senderName: input.envelope.fromName, senderEmail: input.envelope.fromEmail,
        unsubscribeUrl: gtmUnsubscribeUrl(PREVIEW_MAIL_ID), closing: input.closing, personalLine: input.personalLine,
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
      /** 맞춤 한 줄 by "source:ref" (people without one are left out). */
      lines: z.record(z.string().max(80), z.string().max(300)).default({}),
      /**
       * 새 공고로 시작하기 with an outside posting (URL or pasted JD): saved as its Role in the Harper GTM workspace
       * when the mail goes out. Customer Roles are already Roles and never come here.
       */
      draftRole: z.object({ jd: jdSchema, brief: briefSchema, extraRequest: z.string().max(2_000).default("") }).nullable().default(null),
    }).parse(data);
    const { draftRole, ...mail } = input;
    let { roleId, gtmRoleId } = mail;
    if (draftRole && draftRole.jd.source !== "customer_role") {
      // The same path as 저장하고 외부 검색으로: the same posting reuses its Role; nothing is searched or sent from it.
      const saved = await createGtmRole({ user, ...draftRole });
      if (saved.dryRun) throw new GtmWritesOffError();
      roleId = saved.roleId;
      gtmRoleId = saved.roleId;
    }
    return { roleId, results: await sendGtmCandidateMails({ user, ...mail, roleId, gtmRoleId }) };
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
  /** "오늘 12/50통": the signed-in sender's GTM mails today (Korea time, all plays) and the daily limit. */
  "mail.quota": async (_data, user) => ({ quota: await readGtmSendQuota(user.id) }),

  "funnel.list": async (data) => listApplyFunnel(z.object({ days: days.default(30) }).parse(data)),
  "funnel.applications": async (data) => listCompanyApplications(z.object({
    // A company's workspace id, or 'mail:<domain>' for a mail domain no company on Harper has.
    key: z.union([uuid, z.string().regex(/^mail:[a-z0-9._-]{1,253}$/)]),
    days: days.default(30),
  }).parse(data)),
  "funnel.candidate": async (data) => ({ preview: await loadCandidatePagePreview(z.object({ talentId: uuid }).parse(data).talentId) }),

  /** #5: settings, numbers and the latest runs, read only. */
  "agent.overview": async (data) => {
    const input = z.object({ days: days.default(30), includeTest }).parse(data);
    const [settings, funnel, runs] = await Promise.all([readAgentSettings(), agentFunnel(input), listAgentRuns(10)]);
    return { settings, funnel, runs };
  },
  "agent.people": async (data) => listAgentPeople(z.object({
    status: agentStatus.nullish(), source: agentSource.nullish(), q: z.string().max(200).nullish(),
    limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0), includeTest,
  }).parse(data)),
  "agent.timeline": async (data) => ({ timeline: await readAgentTimeline(z.object({ id: uuid }).parse(data).id) }),
  "agent.queue": async (data) => agentQueue(z.object({ channel: agentHumanChannel.nullish(), includeTest }).parse(data)),
  "agent.settings.save": async (data, user) => {
    assertAgentWrites();
    return { settings: await saveAgentSettings(agentSettingsSchema.parse(data), user.id) };
  },
  /** Pasted LinkedIn Recruiter applicants (CSV or tab-separated, header first) → an import run. */
  "agent.import": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ text: z.string().min(1).max(2_000_000), isTest: z.boolean().default(false) }).parse(data);
    return importRecruiterApplicants({ text: input.text, isTest: input.isTest, userId: user.id });
  },
  "agent.run.start": async (data, user) => {
    assertAgentWrites();
    return { run: await startManualRun({ userId: user.id, isTest: z.object({ isTest: z.boolean().default(false) }).parse(data).isTest }) };
  },
  /** 긴급 중지 works with writes off too: it only stops. */
  "agent.stop": async (_data, user) => stopAgent({ userId: user.id }),
  "agent.person.sent": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ id: uuid, account: z.string().trim().max(200).nullish(), body: z.string().max(10_000).nullish() }).parse(data);
    return { person: await markSentByHand({ id: input.id, userId: user.id, account: input.account ?? null, draftBody: input.body ?? null }) };
  },
  "agent.person.skip": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ id: uuid, reason: z.string().max(500).default("") }).parse(data);
    return { person: await skipPerson({ id: input.id, userId: user.id, reason: input.reason }) };
  },
  "agent.person.replied": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ id: uuid, text: z.string().max(8_000).default(""), stop: z.boolean().default(false) }).parse(data);
    return { person: await markReplied({ id: input.id, userId: user.id, text: input.text, stop: input.stop }) };
  },
  "agent.person.approve": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ id: uuid, subject: z.string().max(300).nullish(), body: z.string().max(10_000).nullish() }).parse(data);
    return { person: await approveDraft({ id: input.id, userId: user.id, subject: input.subject ?? null, body: input.body ?? null }) };
  },
  "agent.person.reject": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ id: uuid, reason: z.string().max(500).default("") }).parse(data);
    return { person: await rejectDraft({ id: input.id, userId: user.id, reason: input.reason }) };
  },
  "agent.person.edit": async (data, user) => {
    assertAgentWrites();
    const input = z.object({ id: uuid, subject: z.string().max(300).nullable().default(null), body: z.string().min(1).max(10_000) }).parse(data);
    return { person: await editDraft({ id: input.id, userId: user.id, subject: input.subject, body: input.body }) };
  },
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
    if (error instanceof AgentActionError) return NextResponse.json({ error: error.message }, { status: 409 });
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
