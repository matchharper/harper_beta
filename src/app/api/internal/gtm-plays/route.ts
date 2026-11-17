import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { billingErrorResponse } from "@/lib/org/billing/http";
import { GTM_WORKSPACE_ID, GtmWritesOffError, gtmWritesEnabled } from "@/lib/gtmPlays/constants";
import { listApplyFunnel, listCompanyApplications, loadCandidatePagePreview } from "@/lib/gtmPlays/applyFunnel.server";
import { APPLICANT_FILE_MAX_BYTES } from "@/lib/gtmPlays/agent/applicantSheet";
import { importApplicantFile } from "@/lib/gtmPlays/agent/applicantUpload.server";
import { listAgentLog, listAgentSearchLog } from "@/lib/gtmPlays/agent/log.server";
import { normalizeSignalSettings } from "@/lib/gtmPlays/agent/tuning";
import { clampSendHours, SEND_HOURS_LIMIT } from "@/lib/gtmPlays/agent/people";
import { AGENT_EXCLUDE_BUCKETS, type AgentExcludeBucket } from "@/lib/gtmPlays/agent/funnel";
import { AGENT_STAGES, LOG_AFTER_FILTERS, type AgentStage } from "@/lib/gtmPlays/agent/stage";
import { readAgentSettings } from "@/lib/gtmPlays/agent/store.server";
import {
  AgentActionError,
  agentDaily,
  agentFunnel,
  agentHealth,
  enableAgent,
  listAgentPeopleLog,
  listAgentRuns,
  markReplied,
  readAgentTimeline,
  saveAgentSettingsFromForm,
  setPostingVerdict,
  skipPerson,
  startManualRun,
  stopAgent,
} from "@/lib/gtmPlays/agent/views.server";

export const runtime = "nodejs";
export const maxDuration = 300;

const uuid = z.string().uuid();
const days = z.coerce.number().int().min(1).max(365).default(90);
/** #5 period: 최근 N일, or a custom range of KST days (both ends YYYY-MM-DD); agent/period.ts resolves and clamps it. */
const periodDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish();
const agentPeriod = { days: days.default(30), from: periodDay, to: periodDay };

type Handler = (data: unknown, user: User) => Promise<unknown>;

// #5 후보자 소싱 에이전트
const agentSourceId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/);
/**
 * 설정 저장 from the settings form. No `enabled` (only the switch turns the agent on or off: an unknown key is dropped),
 * and `version`, the settings version the form was loaded from (a save from an older screen is turned away).
 */
const agentSettingsSchema = z.object({
  version: z.number().int().min(1).optional(),
  senderName: z.string().trim().max(100).nullable().transform((value) => value || null),
  senderEmail: z.string().trim().toLowerCase().max(320).nullable().transform((value) => value || null)
    .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value), "메일 주소 형식이 아니에요."),
  dailyMailCap: z.number().int().min(0).max(500),
  dailyCostUsd: z.number().min(0).max(1_000),
  /**
   * Korea-time hours, always within 8–21 (agent/people.ts SEND_HOURS_LIMIT: no ads at night without separate consent):
   * an hour outside is moved to the nearest allowed one.
   */
  sendStartHour: z.number().int().transform((hour) => clampSendHours(hour, SEND_HOURS_LIMIT.end).startHour),
  sendEndHour: z.number().int().transform((hour) => clampSendHours(SEND_HOURS_LIMIT.start, hour).endHour),
  /** Korea-time weekdays, 0 = Sunday … 6 = Saturday. */
  sendWeekdays: z.array(z.number().int().min(0).max(6)).max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b))
    .refine((days) => days.length > 0, "보내는 요일을 하루 이상 골라 주세요."),
  followupDays: z.number().int().min(1).max(60),
  quietDaysAfterEnd: z.number().int().min(0).max(365),
  /** 사람 찾기 settings: checked and clamped by normalizeSignalSettings when saved and read. */
  signals: z.record(z.string(), z.unknown()),
}).refine((value) => value.sendStartHour < value.sendEndHour, {
  message: "보내는 시간의 시작이 끝보다 빨라야 해요.", path: ["sendEndHour"],
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
    const input = z.object({ ...agentPeriod, includeTest }).parse(data);
    const [settings, funnel, runs, health] = await Promise.all([readAgentSettings(), agentFunnel(input), listAgentRuns(10), agentHealth()]);
    return { settings, funnel, runs, health };
  },
  /** 하루별 성능: the period's people by the day they were found, with 수치's columns, cost by step and the day's runs. */
  "agent.daily": async (data) => agentDaily(z.object({ ...agentPeriod, includeTest, source: agentSource.nullish() }).parse(data)),
  /** 로그 · 사람: the numbers' people with the numbers' own filters (a number click shows exactly its people). */
  "agent.people": async (data) => listAgentPeopleLog(z.object({
    ...agentPeriod, includeTest, source: agentSource.nullish(),
    stage: z.enum(AGENT_STAGES as [AgentStage, ...AgentStage[]]).nullish(), after: z.enum(LOG_AFTER_FILTERS).nullish(),
    reason: z.enum(AGENT_EXCLUDE_BUCKETS as [AgentExcludeBucket, ...AgentExcludeBucket[]]).nullish(),
    runId: uuid.nullish(), tuningVersion: z.string().max(40).nullish(), q: z.string().max(200).nullish(),
    limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0),
  }).parse(data)),
  "agent.timeline": async (data) => ({ timeline: await readAgentTimeline(z.object({ id: uuid }).parse(data).id) }),
  /** #5 로그: who got which mail and why (or every step), newest first. */
  /** 검색 기록: one line per search (a site in a run) and per uploaded applicant file, newest first. */
  "agent.searches": async (data) => listAgentSearchLog(z.object({
    ...agentPeriod, includeTest, limit: z.number().int().min(1).max(300).default(100),
  }).parse(data)),
  "agent.log": async (data) => listAgentLog(z.object({
    ...agentPeriod, source: z.string().max(40).nullish(), mailsOnly: z.boolean().default(true), includeTest,
    limit: z.number().int().min(1).max(200).default(50), offset: z.number().int().min(0).default(0),
  }).parse(data)),
  "agent.settings.save": async (data, user) => {
    assertAgentWrites();
    const { version, ...input } = agentSettingsSchema.parse(data);
    return {
      settings: await saveAgentSettingsFromForm({
        settings: { ...input, signals: normalizeSignalSettings(input.signals).settings }, loadedVersion: version ?? null, userId: user.id,
      }),
    };
  },
  /** The switch on (the switch off is agent.stop). */
  "agent.enable": async (_data, user) => {
    assertAgentWrites();
    return { settings: await enableAgent({ userId: user.id }) };
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
  /** 맞음 / 안 맞음 on one proposed posting (null clears it); the posting is its place in the list, checked by Role and title. */
  "agent.posting.verdict": async (data, user) => {
    assertAgentWrites();
    const input = z.object({
      id: uuid, index: z.number().int().min(0).max(9), roleId: z.string().max(100).nullable(), title: z.string().max(2_000),
      verdict: z.enum(["right", "wrong"]).nullable(),
    }).parse(data);
    return {
      person: await setPostingVerdict({
        id: input.id, ref: { index: input.index, roleId: input.roleId, title: input.title }, value: input.verdict, userId: user.id,
      }),
    };
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
