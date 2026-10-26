import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import {
  assertOrgRoleAccess,
  assertOrgWorkspaceAccess,
  OrgHttpError,
} from "@/lib/org/server";
import { readMatchingRunHistory } from "@/lib/companyFirstSearch/history";

const scope = z.object({
  workspaceId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = scope.safeParse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    if (!parsed.success)
      throw new OrgHttpError(400, "Invalid history parameters");
    const args = parsed.data;
    const admin = getSupabaseAdmin();
    if (args.roleId)
      await assertOrgRoleAccess({
        ...args,
        roleId: args.roleId,
        admin,
        user,
        permission: "view",
      });
    else await assertOrgWorkspaceAccess({ ...args, admin, user });
    const history = await readMatchingRunHistory({
      ...args,
      admin,
      user,
      limit: 20,
    });
    return NextResponse.json(
      {
        ...history,
        items: history.items.map(
          ({ id, createdAt, status, roles, reviewedTalents, selected }) => ({
            id,
            createdAt,
            status,
            roles,
            reviewedTalents,
            selected,
          })
        ),
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
    console.error("[org/search-history]", error);
    return NextResponse.json(
      { error: "검색 기록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
