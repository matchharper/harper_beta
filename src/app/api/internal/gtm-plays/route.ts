import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { GTM_WORKSPACE_ID, GtmWritesOffError, gtmWritesEnabled } from "@/lib/gtmPlays/constants";
import { listApplyFunnel, listCompanyApplications, loadCandidatePagePreview } from "@/lib/gtmPlays/applyFunnel.server";
import { APPLICANT_FILE_MAX_BYTES } from "@/lib/gtmPlays/agent/applicantSheet";
import { importApplicantFile } from "@/lib/gtmPlays/agent/applicantUpload.server";
import { listAgentLog } from "@/lib/gtmPlays/agent/log.server";
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
  readAgentTimeline,
  rejectDraft,
  skipPerson,
  startManualRun,
  stopAgent,
} from "@/lib/gtmPlays/agent/views.server";

export const runtime = "nodejs";
export const maxDuration = 300;

const uuid = z.string().uuid();
const days = z.coerce.number().int().min(1).max(365).default(90);

type Handler = (data: unknown, user: User) => Promise<unknown>;

// #5 후보자 소싱 에이전트
/** One source's settings; tuning is checked and clamped where it is used (agent/tuning.ts). */
const agentSourceSetting = z.object({
  enabled: z.boolean(), daily: z.number().int().min(0).max(500), tuning: z.record(z.string(), z.unknown()).optional(),
});
const agentSourceId = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  senderName: z.string().trim().max(100).nullable().transform((value) => value || null),
  senderEmail: z.string().trim().toLowerCase().max(320).nullable().transform((value) => value || null)
    .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value), "메일 주소 형식이 아니에요."),
  dailyMailCap: z.number().int().min(0).max(500),
  dailyCostUsd: z.number().min(0).max(1_000),
  sendStartHour: z.number().int().min(0).max(23),
  sendEndHour: z.number().int().min(1).max(24),
  sendMode: z.enum(["approve", "auto"]),
  followupDays: z.number().int().min(1).max(60),
  quietDaysAfterEnd: z.number().int().min(0).max(365),
  ownDomainAllowed: z.boolean(),
  sources: z.record(agentSourceId, agentSourceSetting).refine((value) => Object.keys(value).length <= 60, "소스가 너무 많아요."),
}).refine((value) => value.sendStartHour !== value.sendEndHour % 24, { message: "보내는 시간의 시작과 끝이 같아요.", path: ["sendEndHour"] })
  .refine((value) => !value.enabled || (value.senderName && value.senderEmail), {
    message: "켜려면 보내는 사람 이름과 메일 주소가 필요해요.", path: ["senderEmail"],
  });
const agentStatus = z.enum(["found", "excluded", "no_fit", "matched", "drafted", "approved", "sent", "skipped", "replied", "ended", "failed"]);
const agentSource = agentSourceId;
const includeTest = z.boolean().default(false);
/** #5 writes need the same switch as the other plays (sending, paid runs, records). */
function assertAgentWrites() {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
}

const handlers: Record<string, Handler> = {
  config: async () => ({ writes: gtmWritesEnabled(), gtmWorkspaceId: GTM_WORKSPACE_ID }),

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
  "agent.queue": async (data) => agentQueue(z.object({ includeTest }).parse(data)),
  "agent.settings.save": async (data, user) => {
    assertAgentWrites();
    return { settings: await saveAgentSettings(agentSettingsSchema.parse(data), user.id) };
  },
  /** A LinkedIn Recruiter applicant export dropped on /ops #5 (.xlsx/.csv as base64) → an import run of the new people. */
  "agent.applicants.upload": async (data, user) => {
    assertAgentWrites();
    const input = z.object({
      fileName: z.string().trim().min(1).max(300),
      base64: z.string().min(1).max(Math.ceil(APPLICANT_FILE_MAX_BYTES / 3) * 4 + 4),
      isTest: z.boolean().default(false),
    }).parse(data);
    const bytes = new Uint8Array(Buffer.from(input.base64, "base64"));
    return importApplicantFile({ fileName: input.fileName, bytes, isTest: input.isTest, userId: user.id });
  },
  "agent.run.start": async (data, user) => {
    assertAgentWrites();
    return { run: await startManualRun({ userId: user.id, isTest: z.object({ isTest: z.boolean().default(false) }).parse(data).isTest }) };
  },
  /** 긴급 중지 works with writes off too: it only stops. */
  "agent.stop": async (_data, user) => stopAgent({ userId: user.id }),
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
