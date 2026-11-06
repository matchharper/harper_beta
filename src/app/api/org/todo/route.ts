import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/httpError";
import {
  assertOrgRoleAccess,
  assertOrgWorkspacePermission,
} from "@/lib/org/server";
import { readOrgNow } from "@/lib/org/todo.server";
import {
  decideRoleTodoSuggestion,
  markTodoRead,
} from "@/lib/org/todoSuggestions.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const scope = z.object({
  workspaceId: z.string().uuid(),
  /** Without a Role: every Role this person can see. */
  roleId: z.string().uuid().optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
  range: z.enum(["all", "recent"]).default("recent"),
});

const decision = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid(),
  suggestionId: z.string().uuid(),
  decision: z.enum(["approve", "dismiss", "mute"]),
});
const cancelSchedule = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid(),
  cancelSchedule: z.object({
    scheduleId: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
  }),
});
const read = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid(),
  read: z.string().min(1).max(200),
});

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  if (error instanceof Error && error.message === "Unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.error("[org/todo]", error);
  return NextResponse.json(
    { error: "To-do를 불러오지 못했어요." },
    { status: 500 }
  );
}

/**
 * The team's answer to a Harper suggestion. Approving returns the plan; the
 * web sends it to the Role chat as the team's own message, so Harper does
 * the work with the tools it already has.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => null);
    const admin = getSupabaseAdmin();
    // Cancelling Harper's scheduled work: a company decision.
    const cancelBody = cancelSchedule.safeParse(body);
    if (cancelBody.success) {
      await assertOrgRoleAccess({
        admin,
        user,
        workspaceId: cancelBody.data.workspaceId,
        roleId: cancelBody.data.roleId,
      });
      const { cancelHarperScheduleFromTodo } = await import("@/lib/org/harperSchedules.server");
      return NextResponse.json(
        await cancelHarperScheduleFromTodo({
          user,
          workspaceId: cancelBody.data.workspaceId,
          roleId: cancelBody.data.roleId,
          ...cancelBody.data.cancelSchedule,
        })
      );
    }
    // "읽음" on an update: it leaves this person's To-do.
    const readBody = read.safeParse(body);
    if (readBody.success) {
      await assertOrgRoleAccess({
        admin,
        user,
        workspaceId: readBody.data.workspaceId,
        roleId: readBody.data.roleId,
        permission: "view",
      });
      await markTodoRead({
        admin,
        itemId: readBody.data.read,
        roleId: readBody.data.roleId,
        userId: user.id,
      });
      return NextResponse.json({ ok: true });
    }
    const parsed = decision.safeParse(body);
    if (!parsed.success)
      throw new OrgHttpError(400, "Invalid suggestion answer");
    await assertOrgRoleAccess({
      admin,
      user,
      workspaceId: parsed.data.workspaceId,
      roleId: parsed.data.roleId,
    });
    const result = await decideRoleTodoSuggestion({
      admin,
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = scope.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    if (!parsed.success) throw new OrgHttpError(400, "Invalid To-do query");
    const admin = getSupabaseAdmin();
    const { roleId, ...rest } = parsed.data;
    if (roleId) {
      await assertOrgRoleAccess({
        admin,
        user,
        workspaceId: rest.workspaceId,
        roleId,
        permission: "view",
      });
    } else {
      await assertOrgWorkspacePermission({
        admin,
        user,
        workspaceId: rest.workspaceId,
        permission: "view",
      });
    }
    // Cancelling Harper's scheduled work needs manage_candidates (viewers get
    // 403), so only then do its rows carry what cancelling needs.
    const canManage = await assertOrgWorkspacePermission({
      admin,
      user,
      workspaceId: rest.workspaceId,
      permission: "manage_candidates",
    }).then(
      () => true,
      (error) => {
        if (error instanceof OrgHttpError && error.status === 403) return false;
        throw error;
      }
    );
    const todo = await readOrgNow({
      admin,
      user,
      ...rest,
      roleIds: roleId ? [roleId] : "all",
      canManage,
    });
    return NextResponse.json(todo, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
