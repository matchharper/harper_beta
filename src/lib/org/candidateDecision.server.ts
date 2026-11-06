import "server-only";

import type { User } from "@supabase/supabase-js";
import type { CandidateReengagementResolution } from "@/lib/internalCandidateReengagement";
import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";
import { billingErrorCode, billingErrorCopy } from "@/lib/org/billing/types";
import { setOrgCandidateSaved } from "@/lib/org/candidateSave.server";
import {
  setOrgCandidateStageWithIntroBooking,
  type IntroBookingMeeting,
} from "@/lib/org/introBooking.server";
import {
  allowedReasonTags,
  normalizeReasonTags,
  unknownReasonTags,
} from "@/lib/org/reasonTags";
import {
  assertOrgRoleAccess,
  OrgHttpError,
  passOrgCompanyIntro,
  requestOrgCompanyIntro,
  setOrgCandidateStage,
  type CompanyIntroDecisionChannel,
  type OrgCompanyIntroMutationResponse,
  type OrgStageId,
} from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

/**
 * One server function for company decisions about candidates (S2).
 *
 * Every channel (web card, detail view, bulk actions, Slack, email, chat)
 * decides through decideOrgCandidate / decideOrgCandidates. They only choose
 * the existing write function and add no state of their own:
 *
 *   intro card  -> intro_requested   requestOrgCompanyIntro (credit at request)
 *   intro card  -> passed            passOrgCompanyIntro
 *   any         -> process_stopped   setOrgCandidateStage (stop)
 *   with a booking link choice       setOrgCandidateStageWithIntroBooking
 *   other moves                      setOrgCandidateStage
 *   saved / unsaved                  setOrgCandidateSaved
 *
 * The connect row of the plan (pending_connection -> connected or a custom
 * stage) goes through the booking helper only when the caller chose a booking
 * link, as today: a plain web connect sends the intro email without one.
 */

export type OrgDecisionChannel = CompanyIntroDecisionChannel;

export const ORG_DECISION_MAX_ITEMS = 50;
export const ORG_DECISION_CONCURRENCY = 3;
const IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const REASON_TEXT_MAX_LENGTH = 2000;

export type OrgDecisionTarget =
  | { introCandidateId: string }
  | { recommendationId: string; roleId: string; talentId: string };

/** A stage to move to, or a decision that is not a stage. */
export type OrgDecisionTo = OrgStageId | "passed" | "saved" | "unsaved";

export type OrgDecisionConnection = {
  /** Intro request: company recipients of the intro email after acceptance. */
  introRecipientEmails?: string[];
  /** Intro request: the stage the candidate moves to on acceptance. */
  nextStageId?: string | null;
  // Stage moves: passed to setOrgCandidateStage as given.
  candidateConsentRelayId?: string | null;
  contactDirectly?: boolean;
  emailMode?: InternalConnectionConfirmationEmailMode;
  introEmailDraft?: unknown;
  introEmails?: string[] | null;
  reengagementActionId?: string | null;
  reengagementResolution?: CandidateReengagementResolution | null;
  /** The caller prepares and sends the interview invitation itself. */
  scheduleInterview?: boolean;
  skipAutomaticContact?: boolean;
  /** Put the interview booking link into the intro email. */
  introBooking?: "required" | "if_ready";
  locale?: string | null;
  meeting?: IntroBookingMeeting;
};

export type OrgDecisionItem = {
  target: OrgDecisionTarget;
  to: OrgDecisionTo;
  /** The stage the caller saw. A move is refused when it has changed. */
  from?: OrgStageId;
  /** Company-side only; never sent to the candidate. Optional everywhere. */
  reason?: { text?: string | null; tags?: string[] | null } | null;
  /** Intro request: why the company wants to meet. The candidate sees it. */
  appeal?: string | null;
  notifyCandidateOnClosure?: boolean;
  connection?: OrgDecisionConnection;
  /** The same key again returns the earlier decision; nothing runs twice. */
  idempotencyKey?: string | null;
};

export type OrgDecisionPath =
  | "intro_request"
  | "intro_pass"
  | "stop"
  | "connect_with_booking"
  | "stage"
  | "save";

export type OrgDecisionStatus =
  /** The decision took effect now. */
  | "applied"
  /** It was already in effect (e.g. the card was already passed). */
  | "unchanged"
  /** This idempotency key was applied by an earlier request. */
  | "already_applied"
  /** The candidate must say they want to continue first. */
  | "candidate_reengagement_required"
  | "candidate_reengagement_requested"
  | "failed";

export type OrgDecisionEffects = {
  /** An intro email went out with this decision. */
  introEmail: boolean;
  /**
   * Harper tells the candidate about it: the proposal (intro request), a
   * closure notice (stop), or a question whether they want to continue.
   */
  candidateNotice: boolean;
  /** One intro was used. null: it could not be checked. */
  creditUsed: boolean | null;
};

export type OrgDecisionResult = {
  status: OrgDecisionStatus;
  decisionId: number | null;
  effects: OrgDecisionEffects;
  /** Undo comes later (C). */
  undo: null;
  error?: { status: number; message: string; billingCode?: string };
};

type StagePayload = Awaited<ReturnType<typeof setOrgCandidateStage>>;
type BookingMeeting = Awaited<
  ReturnType<typeof setOrgCandidateStageWithIntroBooking>
>["meeting"];

export type OrgDecisionOutcome =
  | {
      kind: "company_intro";
      path: "intro_request" | "intro_pass";
      status: OrgDecisionStatus;
      payload: OrgCompanyIntroMutationResponse;
    }
  | {
      kind: "stage";
      path: "stop" | "connect_with_booking" | "stage";
      status: OrgDecisionStatus;
      payload: StagePayload;
      /** Set when the caller chose a booking link. */
      booking: { linkIncluded: boolean; meeting: BookingMeeting } | null;
    }
  | {
      kind: "save";
      path: "save";
      status: OrgDecisionStatus;
      payload: { ok: true; savedAt: string | null };
    };

type DecisionContext = {
  actor: User;
  /** Site URL for an interview booking link. */
  baseUrl?: string | null;
  channel: OrgDecisionChannel;
  /** company_messages.id of the chat/Slack message behind the decision. */
  sourceMessageId?: number | null;
  workspaceId: string;
};

type Admin = ReturnType<typeof getSupabaseAdmin>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isIntroCardTarget(
  target: OrgDecisionTarget
): target is { introCandidateId: string } {
  return "introCandidateId" in target;
}

function hasReasonText(item: OrgDecisionItem) {
  return Boolean(clean(item.reason?.text));
}

/** The mapping table: which existing function carries this decision. */
export function resolveOrgDecisionPath(item: OrgDecisionItem): OrgDecisionPath {
  if (item.to === "saved" || item.to === "unsaved") return "save";
  if (isIntroCardTarget(item.target)) {
    if (item.to === "intro_requested") return "intro_request";
    if (item.to === "passed") return "intro_pass";
    throw new OrgHttpError(
      400,
      "연결을 요청할 후보는 연결 요청, 넘기기, 저장만 할 수 있어요."
    );
  }
  if (item.to === "passed")
    throw new OrgHttpError(400, "넘기기는 연결을 요청할 후보에게만 할 수 있어요.");
  if (item.to === "process_stopped") return "stop";
  if (item.connection?.introBooking) return "connect_with_booking";
  return "stage";
}

/** The key the decision record keeps (scoped to the person and candidate). */
export function orgDecisionKey(args: {
  actorId: string;
  idempotencyKey?: string | null;
  talentId: string;
}) {
  const key = clean(args.idempotencyKey);
  return key ? `${args.actorId}:${args.talentId}:${key}` : null;
}

async function readIntroCard(
  admin: Admin,
  workspaceId: string,
  introCandidateId: string
) {
  const { data, error } = await (
    admin.from("company_intro_candidates" as any) as any
  )
    .select("role_id, talent_id")
    .eq("id", introCandidateId)
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.role_id) throw new OrgHttpError(404, "제안할 후보자를 찾지 못했습니다.");
  return { roleId: String(data.role_id), talentId: String(data.talent_id) };
}

/** Role and candidate of the item, reading the card only when needed. */
async function itemSubject(
  admin: Admin,
  workspaceId: string,
  item: OrgDecisionItem
) {
  return isIntroCardTarget(item.target)
    ? readIntroCard(admin, workspaceId, item.target.introCandidateId)
    : { roleId: item.target.roleId, talentId: item.target.talentId };
}

async function assertReasonTagsAllowed(
  ctx: DecisionContext,
  item: OrgDecisionItem,
  tags: string[],
  allowedByRole: Map<string, Promise<string[]>>
) {
  const admin = getSupabaseAdmin();
  const { roleId } = await itemSubject(admin, ctx.workspaceId, item);
  // Same check as the move itself, before the Role's criteria are read.
  await assertOrgRoleAccess({
    admin,
    roleId,
    user: ctx.actor,
    workspaceId: ctx.workspaceId,
  });
  if (!allowedByRole.has(roleId)) {
    allowedByRole.set(
      roleId,
      (async () => {
        const { data, error } = await (
          admin.from("company_internal_roles" as any) as any
        )
          .select("criteria")
          .eq("role_id", roleId)
          .maybeSingle();
        if (error) throw error;
        return allowedReasonTags({ criteria: data?.criteria });
      })()
    );
  }
  const unknown = unknownReasonTags(tags, await allowedByRole.get(roleId)!);
  if (unknown.length)
    throw new OrgHttpError(
      400,
      `이 역할에서 쓸 수 없는 이유 태그예요: ${unknown.join(", ")}`
    );
}

function stageStatus(payload: StagePayload): OrgDecisionStatus {
  if ("status" in payload && payload.status === "candidate_reengagement_required")
    return "candidate_reengagement_required";
  if ("status" in payload && payload.status === "candidate_reengagement_requested")
    return "candidate_reengagement_requested";
  return "applied";
}

async function runDecision(
  ctx: DecisionContext,
  item: OrgDecisionItem,
  allowedByRole: Map<string, Promise<string[]>>
): Promise<OrgDecisionOutcome> {
  const path = resolveOrgDecisionPath(item);
  let tags: string[];
  try {
    tags = normalizeReasonTags(item.reason?.tags);
  } catch (error) {
    throw new OrgHttpError(400, (error as Error).message);
  }
  // A reason is kept for a Pass and stage moves. Elsewhere it would be lost.
  if ((path === "intro_request" || path === "save") && (tags.length || hasReasonText(item)))
    throw new OrgHttpError(
      400,
      path === "intro_request"
        ? "연결 요청에는 이유 대신 후보에게 전할 관심 이유(appeal)를 적어 주세요."
        : "저장에는 이유를 남기지 않아요."
    );
  if (tags.length) await assertReasonTagsAllowed(ctx, item, tags, allowedByRole);
  const sourceMessageId = ctx.sourceMessageId ?? null;
  const reasonText = item.reason?.text;

  if (path === "intro_pass" || path === "intro_request") {
    const introCandidateId = (item.target as { introCandidateId: string })
      .introCandidateId;
    if (path === "intro_pass") {
      const payload = await passOrgCompanyIntro({
        channel: ctx.channel,
        introCandidateId,
        reason:
          typeof reasonText === "string"
            ? reasonText.trim().slice(0, REASON_TEXT_MAX_LENGTH)
            : undefined,
        reasonTags: tags,
        sourceMessageId,
        user: ctx.actor,
        workspaceId: ctx.workspaceId,
      });
      return {
        kind: "company_intro",
        path,
        payload,
        status: payload.status === "passed" ? "applied" : "unchanged",
      };
    }
    const payload = await requestOrgCompanyIntro({
      channel: ctx.channel,
      companyAppeal: String(item.appeal ?? ""),
      introCandidateId,
      introRecipientEmails: item.connection?.introRecipientEmails ?? [],
      nextStageId: item.connection?.nextStageId ?? null,
      sourceMessageId,
      user: ctx.actor,
      workspaceId: ctx.workspaceId,
    });
    return {
      kind: "company_intro",
      path,
      payload,
      status: payload.status === "requested" ? "applied" : "unchanged",
    };
  }

  if (path === "save") {
    const admin = getSupabaseAdmin();
    const target = isIntroCardTarget(item.target)
      ? {
          ...(await readIntroCard(
            admin,
            ctx.workspaceId,
            item.target.introCandidateId
          )),
          recommendationId: `company-intro:${item.target.introCandidateId}`,
        }
      : item.target;
    const payload = await setOrgCandidateSaved({
      channel: ctx.channel,
      decisionKey: orgDecisionKey({
        actorId: ctx.actor.id,
        idempotencyKey: item.idempotencyKey,
        talentId: target.talentId,
      }),
      recommendationId: target.recommendationId,
      roleId: target.roleId,
      saved: item.to === "saved",
      sourceMessageId,
      talentId: target.talentId,
      user: ctx.actor,
      workspaceId: ctx.workspaceId,
    });
    return { kind: "save", path, payload, status: "applied" };
  }

  const target = item.target as Exclude<
    OrgDecisionTarget,
    { introCandidateId: string }
  >;
  const connection = item.connection ?? {};
  const isStop = path === "stop";
  const decisionKey = orgDecisionKey({
    actorId: ctx.actor.id,
    idempotencyKey: item.idempotencyKey,
    talentId: target.talentId,
  });
  // Undefined values count as left out (the saved approval is JSON), so a
  // caller's input reaches setOrgCandidateStage as it did before.
  const input: Parameters<typeof setOrgCandidateStage>[0] = {
    candidateConsentRelayId: connection.candidateConsentRelayId,
    contactDirectly: connection.contactDirectly,
    decisionChannel: ctx.channel,
    decisionKey: decisionKey ?? undefined,
    emailMode: connection.emailMode,
    expectedPreviousStage: item.from,
    introEmailDraft: connection.introEmailDraft,
    introEmails: connection.introEmails,
    notifyCandidateOnClosure: item.notifyCandidateOnClosure,
    reasonTags: tags.length ? tags : undefined,
    recommendationId: target.recommendationId,
    reengagementActionId: connection.reengagementActionId,
    reengagementResolution: connection.reengagementResolution,
    roleId: target.roleId,
    scheduleInterview: connection.scheduleInterview,
    skipAutomaticContact: connection.skipAutomaticContact,
    sourceMessageId: sourceMessageId ?? undefined,
    stage: item.to as OrgStageId,
    talentId: target.talentId,
    user: ctx.actor,
    workspaceId: ctx.workspaceId,
    // The free-text reason is the stop note for a stop and the acceptance
    // reason for other moves, the same fields the web and chat filled.
    ...(reasonText !== undefined
      ? isStop
        ? { stopNote: reasonText }
        : { acceptReason: reasonText }
      : {}),
  };

  if (path === "connect_with_booking") {
    const baseUrl = clean(ctx.baseUrl);
    if (!baseUrl) throw new Error("A booking link needs the site URL");
    const decided = await setOrgCandidateStageWithIntroBooking({
      baseUrl,
      booking: connection.introBooking!,
      locale: connection.locale,
      meeting: connection.meeting,
      stage: input,
    });
    return {
      booking: {
        linkIncluded: decided.bookingLinkIncluded,
        meeting: decided.meeting,
      },
      kind: "stage",
      path,
      payload: decided.payload,
      status: stageStatus(decided.payload),
    };
  }
  const payload = await setOrgCandidateStage(input);
  return { booking: null, kind: "stage", path, payload, status: stageStatus(payload) };
}

/**
 * One decision. Errors are thrown exactly as the underlying function throws
 * them, so the existing routes and chat tools keep their responses.
 */
export async function decideOrgCandidate(
  args: DecisionContext & { item: OrgDecisionItem }
): Promise<OrgDecisionOutcome> {
  return runDecision(args, args.item, new Map());
}

/** The result of a decision the caller knows is a stage move. */
export function stageOutcome(outcome: OrgDecisionOutcome) {
  if (outcome.kind !== "stage")
    throw new Error(`Expected a stage move, got ${outcome.path}`);
  return outcome;
}

/** The result of a decision the caller knows is a Pass or intro request. */
export function companyIntroOutcome(outcome: OrgDecisionOutcome) {
  if (outcome.kind !== "company_intro")
    throw new Error(`Expected a company intro decision, got ${outcome.path}`);
  return outcome;
}

/** Reads, on a decision that took effect, what it did. Never throws. */
async function describeDecision(
  ctx: DecisionContext,
  item: OrgDecisionItem,
  outcome: OrgDecisionOutcome
): Promise<Pick<OrgDecisionResult, "decisionId" | "effects">> {
  const effects: OrgDecisionEffects = {
    introEmail:
      outcome.kind === "stage" &&
      "introEmailMessageId" in outcome.payload &&
      Boolean(outcome.payload.introEmailMessageId),
    candidateNotice:
      outcome.status === "candidate_reengagement_requested" ||
      (outcome.status === "applied" &&
        (outcome.path === "intro_request" ||
          (outcome.path === "stop" && item.notifyCandidateOnClosure !== false))),
    creditUsed: false,
  };
  let decisionId: number | null = null;
  try {
    const admin = getSupabaseAdmin();
    if (outcome.kind === "company_intro") {
      const introCandidateId = outcome.payload.introCandidateId;
      const { data, error } = await (
        admin.from("company_decision_events" as any) as any
      )
        .select("id")
        .eq("company_workspace_id", ctx.workspaceId)
        .eq("intro_candidate_id", introCandidateId)
        .eq("action", outcome.path === "intro_pass" ? "pass" : "request_intro")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      decisionId = data?.id == null ? null : Number(data.id);
      if (outcome.path === "intro_request" && outcome.status === "applied") {
        // Charged at request time (request_company_intro_v1).
        const { data: credit, error: creditError } = await (
          admin.from("company_workspace_credit_events" as any) as any
        )
          .select("delta")
          .eq("company_workspace_id", ctx.workspaceId)
          .eq("action_code", "intro_request")
          .eq("business_key", introCandidateId)
          .maybeSingle();
        if (creditError) throw creditError;
        effects.creditUsed = Number(credit?.delta) === -1;
      }
      return { decisionId, effects };
    }
    if (outcome.status !== "applied") return { decisionId, effects };
    const subject = await itemSubject(admin, ctx.workspaceId, item);
    const key = orgDecisionKey({
      actorId: ctx.actor.id,
      idempotencyKey: item.idempotencyKey,
      talentId: subject.talentId,
    });
    if (!key) return { decisionId, effects: { ...effects, creditUsed: null } };
    const found = await findDecisionByKey(admin, subject.roleId, key);
    decisionId = found?.id ?? null;
    if (outcome.kind === "stage" && item.from === "pending_connection") {
      // A paid connection's progress row carries its credit event's id.
      const progressId = clean(found?.progressId);
      if (!progressId) {
        effects.creditUsed = null;
      } else {
        const { data: credit, error: creditError } = await (
          admin.from("company_workspace_credit_events" as any) as any
        )
          .select("delta")
          .eq("id", progressId)
          .eq("action_code", "connect")
          .maybeSingle();
        if (creditError) throw creditError;
        effects.creditUsed = Number(credit?.delta) === -1;
      }
    }
  } catch (error) {
    console.error("[org/decisions:describe]", error);
    effects.creditUsed = null;
  }
  return { decisionId, effects };
}

async function findDecisionByKey(admin: Admin, roleId: string, key: string) {
  const { data, error } = await (
    admin.from("company_decision_events" as any) as any
  )
    .select("id, detail")
    .eq("role_id", roleId)
    .eq("idempotency_key", `decision:${key}`)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: Number(data.id),
    progressId: (data.detail as { progressId?: unknown } | null)?.progressId,
  };
}

const NO_EFFECTS: OrgDecisionEffects = {
  candidateNotice: false,
  creditUsed: false,
  introEmail: false,
};

function failedResult(error: unknown): OrgDecisionResult {
  const billingCode = billingErrorCode(error);
  const status =
    error instanceof OrgHttpError
      ? error.status
      : billingCode
        ? Number((error as { status?: unknown }).status) || 409
        : 500;
  if (status >= 500) console.error("[org/decisions]", error);
  return {
    decisionId: null,
    effects: { ...NO_EFFECTS, creditUsed: null },
    error: {
      status,
      message: billingCode
        ? billingErrorCopy(billingCode, "ko")
        : error instanceof OrgHttpError
          ? error.message
          : // The move may have gone through (an email may have been sent).
            "결과를 확인하지 못했어요. 소개 이메일이나 후보자 안내가 전달됐을 수 있으니 바로 다시 시도하지 말고, 현재 상태를 먼저 확인해 주세요.",
      ...(billingCode ? { billingCode } : {}),
    },
    status: "failed",
    undo: null,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index], index);
      }
    })
  );
  return results;
}

/** What an item is about, for finding repeats within one request. */
function itemIdentity(item: OrgDecisionItem) {
  const key = clean(item.idempotencyKey);
  if (!key) return null;
  return `${JSON.stringify(item.target)}:${key}`;
}

/**
 * Several decisions, at most 50, 3 at a time. Each item gets its own result;
 * one failing item does not stop the others. An item whose key was applied
 * before returns that decision without running again.
 */
export async function decideOrgCandidates(
  args: DecisionContext & {
    items: OrgDecisionItem[];
    concurrency?: number;
  }
): Promise<Array<OrgDecisionResult & { outcome?: OrgDecisionOutcome }>> {
  if (!args.items.length || args.items.length > ORG_DECISION_MAX_ITEMS)
    throw new OrgHttpError(
      400,
      `한 번에 1~${ORG_DECISION_MAX_ITEMS}명까지 결정할 수 있어요.`
    );
  const allowedByRole = new Map<string, Promise<string[]>>();
  const firstIndex = new Map<string, number>();
  const unique: number[] = [];
  args.items.forEach((item, index) => {
    const identity = itemIdentity(item);
    if (identity && firstIndex.has(identity)) return;
    if (identity) firstIndex.set(identity, index);
    unique.push(index);
  });
  const done = new Map<number, OrgDecisionResult & { outcome?: OrgDecisionOutcome }>();
  await mapWithConcurrency(
    unique,
    args.concurrency ?? ORG_DECISION_CONCURRENCY,
    async (index) => {
      const item = args.items[index];
      try {
        const path = resolveOrgDecisionPath(item);
        if (path !== "intro_request" && path !== "intro_pass" && clean(item.idempotencyKey)) {
          // Pass and intro requests are idempotent on their own (the card).
          const admin = getSupabaseAdmin();
          const subject = await itemSubject(admin, args.workspaceId, item);
          const key = orgDecisionKey({
            actorId: args.actor.id,
            idempotencyKey: item.idempotencyKey,
            talentId: subject.talentId,
          })!;
          const earlier = await findDecisionByKey(admin, subject.roleId, key);
          if (earlier) {
            done.set(index, {
              decisionId: earlier.id,
              effects: NO_EFFECTS,
              status: "already_applied",
              undo: null,
            });
            return;
          }
        }
        const outcome = await runDecision(args, item, allowedByRole);
        const described = await describeDecision(args, item, outcome);
        done.set(index, { ...described, outcome, status: outcome.status, undo: null });
      } catch (error) {
        done.set(index, failedResult(error));
      }
    }
  );
  return args.items.map((item, index) => {
    const identity = itemIdentity(item);
    const source = identity ? firstIndex.get(identity)! : index;
    return done.get(source)!;
  });
}

function stageIdOrUndefined(value: unknown) {
  const stage = clean(value);
  return stage ? (stage as OrgStageId) : undefined;
}

function emailList(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((email) => typeof email !== "string"))
    throw new OrgHttpError(400, `${field}를 확인해 주세요.`);
  return value as string[];
}

/**
 * Reads one item of POST /api/org/decisions. Only fields a web caller may set;
 * an interview invitation (scheduleInterview) stays on the stage route, which
 * prepares and sends it.
 */
export function parseOrgDecisionItem(value: unknown): OrgDecisionItem {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OrgHttpError(400, "결정 항목을 확인해 주세요.");
  const raw = value as Record<string, unknown>;
  const targetRaw = (raw.target ?? {}) as Record<string, unknown>;
  const introCandidateId = clean(targetRaw.introCandidateId);
  const target: OrgDecisionTarget = introCandidateId
    ? { introCandidateId }
    : {
        recommendationId: clean(targetRaw.recommendationId),
        roleId: clean(targetRaw.roleId),
        talentId: clean(targetRaw.talentId),
      };
  if (
    !introCandidateId &&
    !("recommendationId" in target && target.recommendationId && target.roleId && target.talentId)
  )
    throw new OrgHttpError(400, "결정할 후보를 확인해 주세요.");
  const to = clean(raw.to) as OrgDecisionTo;
  if (!to) throw new OrgHttpError(400, "어디로 옮길지 확인해 주세요.");
  const idempotencyKey = clean(raw.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > IDEMPOTENCY_KEY_MAX_LENGTH)
    throw new OrgHttpError(400, "결정마다 idempotencyKey(1~200자)가 필요해요.");
  if (
    raw.notifyCandidateOnClosure !== undefined &&
    typeof raw.notifyCandidateOnClosure !== "boolean"
  )
    throw new OrgHttpError(400, "종료 안내 여부를 확인해 주세요.");
  const reasonRaw = raw.reason as Record<string, unknown> | null | undefined;
  if (reasonRaw !== undefined && reasonRaw !== null && typeof reasonRaw !== "object")
    throw new OrgHttpError(400, "이유를 확인해 주세요.");
  if (reasonRaw?.text !== undefined && reasonRaw.text !== null && typeof reasonRaw.text !== "string")
    throw new OrgHttpError(400, "이유를 확인해 주세요.");
  const connectionRaw = (raw.connection ?? {}) as Record<string, unknown>;
  if (connectionRaw.scheduleInterview !== undefined)
    throw new OrgHttpError(400, "인터뷰 요청은 후보 화면에서 한 명씩 보내 주세요.");
  const emailMode = connectionRaw.emailMode;
  if (emailMode !== undefined && !["schedule", "send_now", "skip"].includes(String(emailMode)))
    throw new OrgHttpError(400, "이메일 전달 방식을 확인해 주세요.");
  const introBooking = connectionRaw.introBooking;
  if (introBooking !== undefined && introBooking !== "required" && introBooking !== "if_ready")
    throw new OrgHttpError(400, "인터뷰 예약 링크 설정을 확인해 주세요.");
  const reengagementResolution = clean(connectionRaw.reengagementResolution);
  if (reengagementResolution && !["ask_candidate", "company_confirmed"].includes(reengagementResolution))
    throw new OrgHttpError(400, "복구 진행 방식을 확인해 주세요.");
  const meetingRaw = connectionRaw.meeting as Record<string, unknown> | undefined;
  return {
    target,
    to,
    from: stageIdOrUndefined(raw.from),
    idempotencyKey,
    ...(reasonRaw
      ? {
          reason: {
            text: typeof reasonRaw.text === "string" ? reasonRaw.text.slice(0, REASON_TEXT_MAX_LENGTH) : undefined,
            tags: reasonRaw.tags as string[] | undefined,
          },
        }
      : {}),
    ...(typeof raw.appeal === "string" ? { appeal: raw.appeal } : {}),
    ...(typeof raw.notifyCandidateOnClosure === "boolean"
      ? { notifyCandidateOnClosure: raw.notifyCandidateOnClosure }
      : {}),
    connection: {
      contactDirectly: connectionRaw.contactDirectly === true ? true : undefined,
      emailMode: emailMode as InternalConnectionConfirmationEmailMode | undefined,
      introBooking: introBooking as "required" | "if_ready" | undefined,
      introEmailDraft: connectionRaw.introEmailDraft ?? undefined,
      introEmails: emailList(connectionRaw.introEmails, "소개 이메일 주소"),
      introRecipientEmails: emailList(connectionRaw.introRecipientEmails, "CC 이메일 주소"),
      meeting:
        meetingRaw && typeof meetingRaw === "object"
          ? {
              attendeeEmails: emailList(meetingRaw.attendeeEmails, "참석자 이메일"),
              durationMinutes: meetingRaw.durationMinutes,
              meetingCandidateMessage: meetingRaw.meetingCandidateMessage,
              meetingPurpose: meetingRaw.meetingPurpose,
              title: meetingRaw.title,
            }
          : undefined,
      nextStageId: clean(connectionRaw.nextStageId) || null,
      reengagementActionId: clean(connectionRaw.reengagementActionId) || undefined,
      reengagementResolution: reengagementResolution
        ? (reengagementResolution as CandidateReengagementResolution)
        : undefined,
      skipAutomaticContact: connectionRaw.skipAutomaticContact === true ? true : undefined,
    },
  };
}
