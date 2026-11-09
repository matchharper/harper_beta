import { withOrgRequestScope } from "@/lib/org/requestScope.server";
import { after, NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/server";
import {
  decideOrgCandidates,
  ORG_DECISION_MAX_ITEMS,
  parseOrgDecisionItem,
  type OrgDecisionItem,
  type OrgDecisionOutcome,
} from "@/lib/org/candidateDecision.server";
import { enqueueOrgAgentWebActionTurn } from "@/lib/org/agent/webActionTurn";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";
import type { User } from "@supabase/supabase-js";

// Up to 50 decisions, 3 at a time; one stage move may send an email.
export const maxDuration = 300;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function errorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json(
      { error: "로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요." },
      { status: 401 }
    );
  }
  console.error("[org/decisions]", error);
  return NextResponse.json(
    {
      error:
        "결정 결과를 확인하지 못했어요. 일부 후보는 이미 처리됐을 수 있으니 바로 다시 시도하지 말고, 현재 상태를 먼저 확인해 주세요.",
    },
    { status: 500 }
  );
}

async function readCardRoles(workspaceId: string, cardIds: string[]) {
  if (!cardIds.length) return new Map<string, string>();
  const { data, error } = await (
    getSupabaseAdmin().from("company_intro_candidates" as any) as any
  )
    .select("id, role_id")
    .eq("company_workspace_id", workspaceId)
    .in("id", cardIds);
  if (error) throw error;
  return new Map<string, string>(
    (data ?? []).map((row: { id: string; role_id: string }) => [
      String(row.id),
      String(row.role_id),
    ])
  );
}

/**
 * Wakes company Harper as the single-decision routes do. Both event kinds are
 * batched (BATCHED_WEB_ACTIONS), so a request joins one run per conversation.
 */
async function wakeHarper(args: {
  items: OrgDecisionItem[];
  outcomes: Array<OrgDecisionOutcome | undefined>;
  user: User;
  workspaceId: string;
}) {
  const jobIds = new Set<string>();
  let cardRoles = new Map<string, string>();
  try {
    cardRoles = await readCardRoles(
      args.workspaceId,
      args.outcomes.flatMap((outcome) =>
        outcome?.kind === "company_intro" ? [outcome.payload.introCandidateId] : []
      )
    );
  } catch (error) {
    console.error("[org/decisions:agent-wake]", error);
  }
  for (const [index, outcome] of args.outcomes.entries()) {
    const item = args.items[index];
    const key = clean(item.idempotencyKey);
    try {
      if (outcome?.kind === "company_intro") {
        const payload = outcome.payload;
        const request = outcome.path === "intro_request";
        const queued = await enqueueOrgAgentWebActionTurn({
          actionContext: request
            ? {
                decision: "request_intro",
                candidateAcceptedAt: payload.candidateAcceptedAt,
                currentStageTag: payload.stageTag,
                newIntroCreated: payload.newIntroCreated,
                introCandidateId: payload.introCandidateId,
                nextStageId: clean(item.connection?.nextStageId),
                status: payload.status,
                channel: "web",
              }
            : {
                decision: "pass",
                introCandidateId: payload.introCandidateId,
                status: payload.status,
                channel: "web", ...(clean(item.reason?.text) ? { reasonText: clean(item.reason?.text) } : {}), ...(item.reason?.tags?.length ? { reasonTags: item.reason.tags } : {}),
              },
          actionName: "company_intro_decision",
          idempotencyKey: [
            "org-web",
            args.workspaceId,
            args.user.id,
            "company-intro",
            payload.introCandidateId,
            request ? "request" : "pass",
            key,
          ].join(":"),
          roleId: cardRoles.get(payload.introCandidateId) ?? null,
          user: args.user,
          workspaceId: args.workspaceId,
        });
        jobIds.add(queued.jobId);
      } else if (outcome?.kind === "stage") {
        const payload = outcome.payload;
        // The decision already queued its own company update.
        const companyUpdateJobId =
          "companyUpdateJobId" in payload ? payload.companyUpdateJobId : null;
        if (companyUpdateJobId) {
          jobIds.add(companyUpdateJobId);
          continue;
        }
        const stage = "stage" in payload ? payload.stage : payload.requestedStage;
        const meeting = outcome.booking?.meeting ?? null;
        const queued = await enqueueOrgAgentWebActionTurn({
          actionContext: {
            closureNotificationDelivered:
              "closureNotificationDelivered" in payload
                ? payload.closureNotificationDelivered
                : null,
            meetingScheduleId: meeting?.scheduleId ?? null,
            interviewInvitationRequested: Boolean(meeting && "stage" in payload),
            previousStage: item.from ?? null,
            recommendationId:
              "recommendationId" in item.target ? item.target.recommendationId : "",
            roleId: payload.roleId,
            stage,
            status: "status" in payload ? payload.status : "completed",
            talentId: payload.talentId,
          },
          actionName: "candidate_stage_changed",
          idempotencyKey: [
            "org-web",
            args.workspaceId,
            args.user.id,
            "candidate-stage",
            payload.roleId,
            payload.talentId,
            stage,
            key,
          ].join(":"),
          roleId: payload.roleId,
          user: args.user,
          workspaceId: args.workspaceId,
        });
        jobIds.add(queued.jobId);
      }
    } catch (error) {
      console.error("[org/decisions:agent-wake]", error);
    }
  }
  return [...jobIds];
}

export async function POST(req: NextRequest) {
  return withOrgRequestScope(() => handlePost(req), after, {
    cachePermissions: true,
  });
}

async function handlePost(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = clean(body.workspaceId);
    if (!workspaceId) throw new OrgHttpError(400, "워크스페이스를 확인해 주세요.");
    if (
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > ORG_DECISION_MAX_ITEMS
    ) {
      throw new OrgHttpError(
        400,
        `한 번에 1~${ORG_DECISION_MAX_ITEMS}명까지 결정할 수 있어요.`
      );
    }
    const items = body.items.map(parseOrgDecisionItem);
    const results = await decideOrgCandidates({
      actor: user,
      baseUrl: getPublicSiteUrlFromRequest(req),
      channel: "web",
      items,
      workspaceId,
    });
    const agentJobIds = await wakeHarper({
      items,
      outcomes: results.map((result) => result.outcome),
      user,
      workspaceId,
    });
    return NextResponse.json({
      ok: true,
      agentJobIds,
      results: results.map(({ outcome: _outcome, ...result }, index) => ({
        idempotencyKey: items[index].idempotencyKey,
        ...result,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
