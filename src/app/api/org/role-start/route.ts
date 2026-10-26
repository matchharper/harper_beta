import { after, NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { createOrResumeDraftRole, fetchRoleCreationState } from "@/lib/org/agent/roleCreationState";
import { fetchBoardProfileLabels, OrgHttpError } from "@/lib/org/server";
import type { OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import {
  answerRoleStartQuestion,
  checkBriefConsistency,
  confirmRoleStartBrief,
  evaluateRoleStartCandidate,
  finishRoleStartQuestions,
  retryStalledRoleStart,
  widenRoleStartCondition,
  continueRoleStartRefinements,
  prewarmRoleStartPool,
  reopenRoleStartReview,
  registerRoleStart,
  removeRoleStartReference,
  submitRoleStartReferences,
  runRoleStartFirstBatch,
  runRoleStartFirstThree,
  saveRoleStartBriefEdit,
  applyRoleInfoToRoleStart,
  beginRoleStartDraft,
  answerRoleStartCompensation,
} from "@/lib/org/roleStart/service";
import { hasRoleStartBrief, loadRoleStartSession } from "@/lib/org/roleStart/session";
import { compensationChips } from "@/lib/org/roleStart/compensation";
import { loadFirstThreeExperiences } from "@/lib/org/roleStart/profiles";
import { roleStartBriefView, roleStartView, visibleBriefHash } from "@/lib/org/roleStart/view";
import { loadRoleRubric, updateRoleRubric } from "@/lib/org/roleStart/rubricUpdate";
import { MAX_REFERENCE_ROWS, referenceRowOf } from "@/lib/org/roleStart/referenceRows";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    console.warn("[org/role-start]", error.status, error.message, error.stack?.split("\n").slice(1, 6).join(" | "));
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/role-start]", error);
  return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
}

// Background steps after the response (refinement, role info, first three) run inside this limit.
export const maxDuration = 300;

const view = roleStartView;

async function firstThreeProfiles(talentIds: string[]) {
  if (!talentIds.length) return {};
  const [labels, experiences] = await Promise.all([
    fetchBoardProfileLabels({ admin: getSupabaseAdmin(), talentIds }),
    loadFirstThreeExperiences(talentIds),
  ]);
  return Object.fromEntries(
    talentIds.map((talentId) => [
      talentId,
      {
        recentCompanies: labels.recentCompanies.get(talentId) ?? [],
        recentSchools: labels.recentSchools.get(talentId) ?? [],
        experiences: experiences.get(talentId) ?? [],
      },
    ])
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const roleId = req.nextUrl.searchParams.get("roleId") ?? "";
    const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
    const state = await fetchRoleCreationState({ allowCompletedRole: true, roleId, user, workspaceId });
    // The 매칭 기준 tab asks only whether this Role has a role start Brief (reading
    // the rubric would start a session for a chat-written Role).
    if (req.nextUrl.searchParams.get("include") === "structured") {
      return NextResponse.json({ structured: state.role.status !== "draft" && (await hasRoleStartBrief(roleId)) });
    }
    const includeRubric = req.nextUrl.searchParams.get("include") === "rubric";
    const rubric = includeRubric ? await loadRoleRubric({ roleId, user, workspaceId }) : null;
    // Polled every second while a step runs: only what the screen shows.
    const session = await loadRoleStartSession(roleId, { forView: true });
    return NextResponse.json({
      session: view(session),
      role: {
        status: state.role.status,
        hasDescription: Boolean(String((state.role as Record<string, unknown>).description ?? "").trim()),
        // Read from the JD by the chat while Setup is open; the form fills in as they land.
        name: state.role.name,
        description: state.role.description,
        locationText: state.role.locationText,
        workMode: state.role.workMode,
        employmentTypes: state.role.employmentTypes,
        salaryRange: state.role.salaryRange,
      },
      issues: session ? checkBriefConsistency(session.brief, state.role as never) : [],
      // The first three's work history and education: the inbox card, and our profile panel.
      // Read once the first three are read (the screen stops asking every second then); a failed read shows cards without history.
      profiles:
        session?.phase === "evaluating" && session.firstCandidates.every((item) => item.verdict || item.verdictError)
          ? await firstThreeProfiles(session.firstCandidates.map((item) => item.talentId)).catch((error) => {
              console.warn("[role-start] first-three profiles", error);
              return {};
            })
          : {},
      // Asked first when the JD stated no compensation, until answered or skipped.
      compensation:
        session &&
        ["questions", "review"].includes(session.phase) &&
        !session.questions.compensation &&
        !String(state.role.salaryRange ?? "").trim()
          ? { chips: compensationChips() }
          : null,
      ...(rubric ? { rubric: roleStartBriefView(rubric), briefHash: visibleBriefHash(rubric) } : {}),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

type Body = {
  action?: string;
  roleId?: string;
  workspaceId?: string;
  questionId?: string;
  chipId?: string | null;
  text?: string | null;
  skip?: boolean;
  brief?: unknown;
  /** visibleBriefHash of the Brief the screen loaded (sent with a whole Brief). */
  briefHash?: string;
  request?: string | null;
  talentId?: string;
  rating?: OrgRoleCriterionGrade;
  answer?: string | null;
  note?: string | null;
  reasonIds?: string[] | null;
  reasonText?: string | null;
  reasonsSkipped?: boolean;
  summaryEdited?: boolean;
  channelIds?: string[] | null;
  emailEnabled?: boolean | null;
  assigneeUserId?: string | null;
};

const RATINGS = new Set(["excellent", "good", "uncertain", "bad"]);

/** The loaded Brief's hash, only with a whole Brief: words asked for apply to the latest Brief. */
function briefHashOf(body: Body) {
  return body.brief && typeof body.briefHash === "string" ? body.briefHash : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const access = { roleId: body.roleId ?? "", user, workspaceId: body.workspaceId ?? "" };
    switch (body.action) {
      case "create": {
        const roleId = await createOrResumeDraftRole({ draftRoleId: access.roleId, user, workspaceId: access.workspaceId });
        return NextResponse.json({ roleId });
      }
      case "start": {
        const started = await beginRoleStartDraft(access);
        after(() => started.completion);
        return NextResponse.json({ session: view(started.session) });
      }
      case "answer":
        return NextResponse.json({
          session: view(
            await answerRoleStartQuestion({
              ...access,
              chipId: body.chipId ?? null,
              questionId: body.questionId ?? "",
              skip: body.skip === true,
              text: body.text ?? null,
            })
          ),
        });
      case "compensation":
        return NextResponse.json({
          session: view(await answerRoleStartCompensation({ ...access, skip: body.skip === true, text: body.text ?? null })),
        });
      case "widen_condition": {
        const session = await widenRoleStartCondition({ ...access, conditionId: String((body as { conditionId?: unknown }).conditionId ?? "") });
        after(() => runRoleStartFirstThree({ roleId: access.roleId, userId: user.id }));
        return NextResponse.json({ session: view(session) });
      }
      case "finish_questions":
        return NextResponse.json({ session: view(await finishRoleStartQuestions(access)) });
      case "retry": {
        const result = await retryStalledRoleStart(access);
        if (result.run === "first_three") after(() => runRoleStartFirstThree({ roleId: access.roleId, userId: user.id }));
        if (result.run === "batch") after(() => runRoleStartFirstBatch({ roleId: access.roleId, userId: user.id }));
        if (result.run === "refine") after(() => continueRoleStartRefinements(access));
        return NextResponse.json({ session: view(result.session) });
      }
      case "edit": {
        const result = await saveRoleStartBriefEdit({ ...access, brief: body.brief, request: body.request, briefHash: briefHashOf(body), summaryEdited: body.summaryEdited === true });
        return NextResponse.json({ ...result, session: view(result.session ?? null) });
      }
      case "role_info": {
        await fetchRoleCreationState({ ...access, allowCompletedRole: true });
        const fields = Array.isArray((body as { fields?: unknown }).fields) ? ((body as { fields: unknown[] }).fields.map(String) as never[]) : [];
        after(() => applyRoleInfoToRoleStart({ ...access, fields }).catch((error) => console.error("[role-start] role info", error)));
        return NextResponse.json({ ok: true });
      }
      case "prewarm": {
        await fetchRoleCreationState({ ...access, allowCompletedRole: true });
        after(() => prewarmRoleStartPool(access.roleId).catch((error) => console.error("[role-start] prewarm", error)));
        return NextResponse.json({ ok: true });
      }
      case "confirm": {
        const result = await confirmRoleStartBrief(access);
        if (result.started) {
          after(() => runRoleStartFirstThree({ roleId: access.roleId, userId: user.id }));
        }
        return NextResponse.json({ ...result, session: view(result.session) });
      }
      case "update_rubric": {
        const result = await updateRoleRubric({
          ...access,
          brief: body.brief,
          request: body.request,
          source: "filter_panel",
          historySource: "website",
          requestReview: true,
          briefHash: briefHashOf(body),
          summaryEdited: body.summaryEdited === true,
        });
        after(() => result.run());
        return NextResponse.json({ rubric: roleStartBriefView(result.brief), judging: result.judging });
      }
      case "add_references": {
        const given = Array.isArray((body as { people?: unknown }).people) ? ((body as { people: unknown[] }).people) : [];
        const rows = given.map(referenceRowOf);
        if (rows.length > MAX_REFERENCE_ROWS) throw new OrgHttpError(400, "참고 인물은 한 번에 5명까지 넣을 수 있어요.");
        if (!rows.length || rows.some((row) => !row)) {
          throw new OrgHttpError(400, "참고 인물마다 링크나 프로필을 넣어 주세요.");
        }
        return NextResponse.json(await submitRoleStartReferences({ ...access, rows: rows.filter((row) => row !== null) }));
      }
      case "remove_reference": {
        await removeRoleStartReference({ ...access, referenceId: String((body as { referenceId?: unknown }).referenceId ?? "") });
        return NextResponse.json({ ok: true });
      }
      case "reopen_review":
        return NextResponse.json({ session: view(await reopenRoleStartReview(access)) });
      case "evaluate": {
        if (!body.talentId || !RATINGS.has(String(body.rating))) {
          throw new OrgHttpError(400, "평가를 골라 주세요.");
        }
        return NextResponse.json({
          session: view(
            await evaluateRoleStartCandidate({
              ...access,
              answer: body.answer,
              note: body.note,
              rating: body.rating!,
              reasonIds: Array.isArray(body.reasonIds) ? body.reasonIds.map(String).slice(0, 10) : [],
              reasonText: body.reasonText ?? null,
              reasonsSkipped: body.reasonsSkipped === true,
              talentId: body.talentId,
            })
          ),
        });
      }
      case "register": {
        const result = await registerRoleStart({
          ...access,
          notification: {
            channelIds: Array.isArray(body.channelIds) ? body.channelIds.map(String).slice(0, 20) : undefined,
            emailEnabled: typeof body.emailEnabled === "boolean" ? body.emailEnabled : undefined,
            assigneeUserId: body.assigneeUserId ? String(body.assigneeUserId) : undefined,
          },
        });
        if (result.registered) {
          // Ratings → Brief, one more person, then the Role turns on.
          after(() => runRoleStartFirstBatch({ roleId: access.roleId, userId: user.id, user, workspaceId: access.workspaceId }));
        }
        return NextResponse.json({ ...result, session: view(result.session) });
      }
      default:
        throw new OrgHttpError(400, "Unknown action");
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
