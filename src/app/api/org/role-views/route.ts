import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrgHttpError } from "@/lib/org/server";
import {
  fillOrgRoleListColumn,
  getOrgBoardLayout,
  listOrgRoleListColumns,
  removeOrgRoleListColumn,
  saveOrgBoardLayout,
} from "@/lib/org/roleViews.server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

function toErrorResponse(error: unknown) {
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
  console.error("[org/role-views]", error);
  return NextResponse.json(
    { error: "화면 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." },
    { status: 500 }
  );
}

const scope = z.object({
  roleId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const params = req.nextUrl.searchParams;
    const parsed = scope.safeParse({
      roleId: params.get("roleId"),
      workspaceId: params.get("workspaceId"),
    });
    if (!parsed.success) throw new OrgHttpError(400, "roleId is required");
    if (params.get("kind") === "board") {
      const layout = await getOrgBoardLayout({ ...parsed.data, user });
      return NextResponse.json({ layout, ok: true });
    }
    const columns = await listOrgRoleListColumns({ ...parsed.data, user });
    return NextResponse.json({ columns, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const input = z.discriminatedUnion("action", [
  scope.extend({
    action: z.literal("save_board"),
    layout: z.record(z.string(), z.unknown()),
  }),
  scope.extend({
    action: z.literal("remove_column"),
    columnId: z.string().uuid(),
  }),
  scope.extend({
    action: z.literal("fill_column"),
    columnId: z.string().uuid(),
    talentIds: z.array(z.string().uuid()),
  }),
]);

// Filling cells calls a model once per batch of candidates.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new OrgHttpError(400, "Invalid request");
    const body = parsed.data;
    if (body.action === "fill_column") {
      const { columns } = await fillOrgRoleListColumn({ ...body, user });
      return NextResponse.json({ columns, ok: true });
    }
    if (body.action === "remove_column") {
      const { columns } = await removeOrgRoleListColumn({ ...body, user });
      return NextResponse.json({ columns, ok: true });
    }
    const layout = await saveOrgBoardLayout({ ...body, user });
    return NextResponse.json({ layout, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
