import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrgHttpError } from "@/lib/org/server";
import {
  deleteOrgBoardText,
  fillOrgRoleListColumn,
  getOrgBoardViewport,
  listOrgBoardCards,
  listOrgBoardTexts,
  listOrgRoleListColumns,
  removeOrgRoleListColumn,
  saveOrgBoardCards,
  saveOrgBoardText,
  saveOrgBoardViewport,
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
    if (params.get("kind") === "board_cards") {
      const positions = await listOrgBoardCards({ ...parsed.data, user });
      return NextResponse.json({ ok: true, positions });
    }
    if (params.get("kind") === "board_viewport") {
      const viewport = await getOrgBoardViewport({ ...parsed.data, user });
      return NextResponse.json({ ok: true, viewport });
    }
    if (params.get("kind") === "board_texts") {
      const board = params.get("board");
      if (!board) throw new OrgHttpError(400, "board is required");
      const texts = await listOrgBoardTexts({ ...parsed.data, board, user });
      return NextResponse.json({ ok: true, texts });
    }
    const columns = await listOrgRoleListColumns({ ...parsed.data, user });
    return NextResponse.json({ columns, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const input = z.discriminatedUnion("action", [
  scope.extend({
    action: z.literal("save_board_cards"),
    moved: z.record(z.string(), z.unknown()),
    placed: z.record(z.string(), z.unknown()),
  }),
  scope.extend({
    action: z.literal("save_board_viewport"),
    viewport: z.record(z.string(), z.unknown()),
  }),
  scope.extend({
    action: z.literal("remove_column"),
    columnId: z.string().uuid(),
  }),
  scope.extend({
    action: z.literal("save_board_text"),
    board: z.string().min(1),
    text: z.object({ id: z.string().uuid() }).passthrough(),
  }),
  scope.extend({
    action: z.literal("delete_board_text"),
    board: z.string().min(1),
    textId: z.string().uuid(),
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
    if (body.action === "save_board_text") {
      const texts = await saveOrgBoardText({ ...body, user });
      return NextResponse.json({ ok: true, texts });
    }
    if (body.action === "delete_board_text") {
      const texts = await deleteOrgBoardText({
        board: body.board,
        id: body.textId,
        roleId: body.roleId,
        user,
        workspaceId: body.workspaceId,
      });
      return NextResponse.json({ ok: true, texts });
    }
    if (body.action === "save_board_cards") {
      await saveOrgBoardCards({ ...body, user });
      return NextResponse.json({ ok: true });
    }
    const viewport = await saveOrgBoardViewport({ ...body, user });
    return NextResponse.json({ ok: true, viewport });
  } catch (error) {
    return toErrorResponse(error);
  }
}
