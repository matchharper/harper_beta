import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import {
  assertOrgRoleAccess,
  fetchOrgBoard,
  OrgHttpError,
} from "@/lib/org/server";
import {
  candidateSaveId,
  ORG_CANDIDATE_SAVE_KIND,
} from "@/lib/org/candidateSaved.server";
import { isOrgInboxStage } from "@/lib/org/pipelineStage";
import { z } from "zod";

const input = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid(),
  talentId: z.string().uuid(),
  recommendationId: z.string().min(1),
  saved: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      throw new OrgHttpError(400, "Invalid candidate bookmark");
    const args = parsed.data;
    const admin = getSupabaseAdmin();
    await assertOrgRoleAccess({
      admin,
      user,
      workspaceId: args.workspaceId,
      roleId: args.roleId,
    });
    // Reuse authoritative company visibility, including ready proposals.
    const board = await fetchOrgBoard({
      user,
      workspaceId: args.workspaceId,
      roleId: args.roleId,
      includeProfileLabels: false,
    });
    const item = board.items.find(
      (item) =>
        item.talentId === args.talentId &&
        item.recommendationId === args.recommendationId
    );
    if (!item) throw new OrgHttpError(404, "Candidate not found");
    if (args.saved && !isOrgInboxStage(item.stage))
      throw new OrgHttpError(409, "This candidate has already left the inbox");
    const { error } = await admin.from("talent_progress").upsert(
      {
        id: candidateSaveId(args.workspaceId, item),
        kind: ORG_CANDIDATE_SAVE_KIND,
        role_id: item.roleId,
        talent_id: item.talentId,
        recommendation_id:
          item.source === "recommendation" ? item.recommendationId : null,
        user_id: user.email ?? user.id,
        text: "",
        created_at: new Date().toISOString(),
        open_to_talent: false,
        open_to_company: false,
        metadata: {
          workspaceId: args.workspaceId,
          saved: args.saved,
          stage: item.stage,
          actorUserId: user.id,
        },
      },
      { onConflict: "id" }
    );
    if (error) throw error;
    return NextResponse.json(
      { ok: true },
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
    console.error("[org/candidate-save]", error);
    return NextResponse.json(
      { error: "후보자 저장 상태를 변경하지 못했습니다." },
      { status: 500 }
    );
  }
}
