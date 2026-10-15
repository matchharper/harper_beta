import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readMatchingRunHistory } from "./history";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { assertOrgRoleAccess, OrgHttpError } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

const scopeSchema = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid(),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function handleDevRoleSearch(
  req: NextRequest,
  surface: "ops" | "org"
) {
  try {
    const user =
      surface === "ops"
        ? await requireInternalApiUser(req)
        : await requireAuthenticatedUser(req);
    if (surface === "org" && !isInternalDomainEmail(user.email)) {
      throw new InternalApiError(403, "Forbidden");
    }
    const input = scopeSchema.safeParse(
      req.method === "POST"
        ? await req.json().catch(() => null)
        : Object.fromEntries(req.nextUrl.searchParams)
    );
    if (!input.success)
      throw new InternalApiError(400, "Invalid role search parameters");
    const { workspaceId, roleId, offset } = input.data;
    const admin = getSupabaseAdmin();
    if (surface === "org") {
      await assertOrgRoleAccess({
        admin,
        user,
        workspaceId,
        roleId,
        permission: "view",
      });
    }
    const { data: role, error: roleError } = await admin
      .from("company_roles")
      .select("role_id")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", roleId)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) throw new InternalApiError(404, "Role not found");
    if (req.method === "POST") {
      const { data, error } = await admin.rpc(
        "enqueue_talent_first_search_v1" as any,
        {
          p_company_workspace_id: workspaceId,
          p_role_id: roleId,
        } as any
      );
      if (error) throw error;
      if ((data as { status?: string } | null)?.status === "not_queued") {
        throw new InternalApiError(
          409,
          "현재 실행할 수 없는 Role입니다. 활성 상태, 유료 슬롯, Hiring Brief와 테스트 Role 여부를 확인해 주세요."
        );
      }
      return NextResponse.json(data, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    // Active state is independent of pagination; old history pages must not
    // enable another click while the same role is queued or running.
    const [history, active] = await Promise.all([
      readMatchingRunHistory({
        admin,
        workspaceId,
        roleId,
        offset,
        limit: 20,
        ...(surface === "org" ? { user } : {}),
      }),
      (admin.from("company_first_search_runs" as any) as any)
        .select("id,status")
        .eq("company_workspace_id", workspaceId)
        .in("status", ["queued", "running"])
        .or(
          `role_id.eq.${roleId},scheduled_role_ids.cs.{${roleId}},requested_role_ids.cs.{${roleId}}`
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (active.error) throw active.error;
    return NextResponse.json(
      { ...history, activeRun: active.data ?? null },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    if (error instanceof OrgHttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return toInternalApiErrorResponse(
      error,
      "검색 요청 또는 이력을 불러오지 못했습니다."
    );
  }
}
