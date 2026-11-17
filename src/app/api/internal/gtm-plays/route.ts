import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { draftGtmBrief } from "@/lib/gtmPlays/brief.server";
import { GTM_WORKSPACE_ID, gtmWritesEnabled } from "@/lib/gtmPlays/constants";
import { listApplyFunnel, listCompanyApplications, loadCandidatePagePreview } from "@/lib/gtmPlays/applyFunnel.server";
import { jdFromText, listCustomerRoles, readCustomerRoleJd, readJdFromUrl, type GtmJd } from "@/lib/gtmPlays/jd.server";
import { GtmWritesOffError, createGtmRole, findGtmRoleForJd, listGtmRoles } from "@/lib/gtmPlays/outreach.server";
import { importRecruiterApplicants } from "@/lib/gtmPlays/agent/import.server";
import { listAgentLog } from "@/lib/gtmPlays/agent/log.server";
import { readAgentSettings, saveAgentSettings } from "@/lib/gtmPlays/agent/store.server";
import { listRoleRunRoles, listRoleRuns, startRoleRun } from "@/lib/gtmPlays/agent/role.server";
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

export const runtime = "nodejs";
export const maxDuration = 300;

const uuid = z.string().uuid();
const language = z.enum(["ko", "en"]).default("ko");
const days = z.coerce.number().int().min(1).max(365).default(90);

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
const agentSource = z.enum(["recruiter", "opentowork", "threads", "manual", "role"]);
const roleRunSource = z.object({ enabled: z.boolean(), max: z.number().int().min(0).max(50) });
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

  // #5 Role로 사람 찾기: the GTM Roles it picks from or makes (the JD → criteria → Role steps).
  "outreach.roles": async () => ({ roles: await listGtmRoles() }),
  /** Saves the JD + search criteria as one GTM Role; the same posting reopens the Role made before. */
  "outreach.createRole": async (data, user) => {
    const input = z.object({ jd: jdSchema, brief: briefSchema, extraRequest: z.string().max(2_000).default("") }).parse(data);
    return createGtmRole({ user, ...input });
  },
  /** The GTM Role already made for this posting, read only. */
  "outreach.findRole": async (data) => ({ role: await findGtmRoleForJd(z.object({ jd: jdSchema }).parse(data).jd) }),

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
    status: agentStatus.nullish(), source: agentSource.nullish(), q: z.string().max(200).nullish(), roleId: uuid.nullish(),
    limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0), includeTest,
  }).parse(data)),
  "agent.timeline": async (data) => ({ timeline: await readAgentTimeline(z.object({ id: uuid }).parse(data).id) }),
  /** #5 로그: who got which mail and why (or every step), newest first. */
  "agent.log": async (data) => listAgentLog(z.object({
    days: days.default(30), source: z.string().max(40).nullish(), mailsOnly: z.boolean().default(true), includeTest,
    limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0),
  }).parse(data)),
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
  /**
   * Role로 사람 찾기: a run for one Role (a GTM Role, or its copy of a customer Role) from the chosen sources;
   * draftOnly ("찾기만") leaves every mail as a draft for approval. The dispatcher does the rest.
   */
  "agent.role.start": async (data, user) => {
    assertAgentWrites();
    const input = z.object({
      roleId: uuid, isTest: z.boolean().default(false), draftOnly: z.boolean().default(false),
      sources: z.object({ member: roleRunSource, scraped: roleRunSource, external: roleRunSource }),
      keywords: z.array(z.string().trim().max(80)).max(6).default([]), koreanOnly: z.boolean().default(true), language,
    }).parse(data);
    return { run: await startRoleRun({ userId: user.id, ...input }) };
  },
  /** The latest Role runs with their numbers, and the Roles they were for (the people filter). Read only. */
  "agent.role.runs": async (data) => {
    const input = z.object({ includeTest }).parse(data);
    const [runs, roles] = await Promise.all([listRoleRuns({ includeTest: input.includeTest }), listRoleRunRoles()]);
    return { runs, roles };
  },
  "agent.role.roles": async () => ({ roles: await listRoleRunRoles() }),
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
