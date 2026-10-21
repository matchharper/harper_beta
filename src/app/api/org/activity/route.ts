import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import {
  assertOrgRoleAccess,
  fetchOrgBoard,
  OrgHttpError,
} from "@/lib/org/server";
import type {
  OrgHomeActivity,
  OrgHomeActivityKind,
} from "@/lib/org/homeActivity";

const scope = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = scope.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    if (!parsed.success) throw new OrgHttpError(400, "Invalid role");
    const { workspaceId, roleId } = parsed.data;
    const admin = getSupabaseAdmin();
    if (roleId)
      await assertOrgRoleAccess({
        admin,
        user,
        workspaceId,
        roleId,
        permission: "view",
      });
    const board = await fetchOrgBoard({
      user,
      workspaceId,
      roleId,
      includeProfileLabels: false,
      includeInternalStages: false,
    });
    const candidates = new Map(
      board.items.map((item) => [`${item.roleId}:${item.talentId}`, item])
    );
    if (!candidates.size) return NextResponse.json({ items: [] });
    // fetchOrgBoard limits this set to roles and candidates visible to this user.
    const roleIds = [...new Set(board.items.map((item) => item.roleId))];
    const [progress, intros, meetings] = await Promise.all([
      admin
        .from("talent_progress")
        .select("id,role_id,talent_id,kind,metadata,text,created_at")
        .in("role_id", roleIds)
        .eq("open_to_company", true)
        .in("kind", ["intro_to_company", "org_candidate_activity"])
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("company_intro_candidates")
        .select(
          "id,role_id,talent_id,candidate_sent_at,talent_decision_at,status"
        )
        .eq("company_workspace_id", workspaceId)
        .in("role_id", roleIds)
        .order("updated_at", { ascending: false })
        .limit(100),
      admin
        .from("meeting_schedules")
        .select(
          "id,role_id,talent_id,title,status,confirmed_start_at,updated_at,active_round_id"
        )
        .eq("company_workspace_id", workspaceId)
        .in("role_id", roleIds)
        .order("updated_at", { ascending: false })
        .limit(100),
    ]);
    for (const result of [progress, intros, meetings])
      if (result.error) throw result.error;
    const items: OrgHomeActivity[] = [];
    const add = (
      id: string,
      eventRoleId: string,
      talentId: string,
      kind: OrgHomeActivityKind,
      createdAt: string | null,
      text = "",
      meetingStartsAt: string | null = null
    ) => {
      const candidate = candidates.get(`${eventRoleId}:${talentId}`);
      if (!candidate || !createdAt) return;
      items.push({
        id,
        kind,
        createdAt,
        text,
        roleId: eventRoleId,
        roleName: candidate.roleName ?? "",
        meetingStartsAt,
        talentId,
        talentName: candidate.talent.name ?? "",
        recommendationId: candidate.recommendationId,
      });
    };
    for (const row of progress.data ?? []) {
      if (row.kind === "org_candidate_activity") {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const kinds: Record<string, OrgHomeActivityKind> = {
          candidate_message_delivered: "candidate_message",
          candidate_response_received: "candidate_response",
          candidate_contact_sent: "company_question",
        };
        const kind = kinds[String(metadata.eventType)];
        if (kind)
          add(
            row.id,
            row.role_id,
            row.talent_id,
            kind,
            row.created_at,
            row.text
          );
      } else {
        // A company-visible presentation is delivery evidence, not a private acceptance event.
        add(
          row.id,
          row.role_id,
          row.talent_id,
          "pending_connection",
          row.created_at
        );
      }
    }
    for (const row of intros.data ?? []) {
      add(
        `intro-sent:${row.id}`,
        row.role_id,
        row.talent_id,
        "intro_sent",
        row.candidate_sent_at
      );
      if (["connecting", "connected"].includes(row.status))
        add(
          `intro-accepted:${row.id}`,
          row.role_id,
          row.talent_id,
          "intro_accepted",
          row.talent_decision_at
        );
    }
    const rounds = (meetings.data ?? []).flatMap((row) =>
      row.active_round_id ? [row.active_round_id] : []
    );
    const { data: roundRows, error: roundError } = rounds.length
      ? await admin
          .from("meeting_schedule_rounds")
          .select("id,status,updated_at")
          .in("id", rounds)
      : { data: [], error: null };
    if (roundError) throw roundError;
    const roundById = new Map((roundRows ?? []).map((row) => [row.id, row]));
    for (const row of meetings.data ?? []) {
      const round = row.active_round_id
        ? roundById.get(row.active_round_id)
        : null;
      if (row.status === "confirmed" && row.confirmed_start_at)
        add(
          `meeting-confirmed:${row.id}`,
          row.role_id,
          row.talent_id,
          "meeting_confirmed",
          row.updated_at,
          row.title ?? "",
          row.confirmed_start_at
        );
      else if (round && ["queued", "sent", "confirmed"].includes(round.status))
        add(
          `meeting-requested:${round.id}`,
          row.role_id,
          row.talent_id,
          "meeting_requested",
          round.updated_at,
          row.title ?? ""
        );
    }
    return NextResponse.json(
      {
        items: items
          .sort(
            (a, b) =>
              b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
          )
          .slice(0, 100),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof OrgHttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof Error && error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[org/activity]", error);
    return NextResponse.json(
      { error: "피드를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
