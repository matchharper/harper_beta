import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteOrgMessageTemplate,
  listOrgMessageTemplates,
  saveOrgMessageTemplate,
} from "@/lib/org/messageTemplates.server";
import { OrgHttpError } from "@/lib/org/server";
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
  console.error("[org/message-templates]", error);
  return NextResponse.json(
    { error: "템플릿을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
    if (!z.string().uuid().safeParse(workspaceId).success) {
      throw new OrgHttpError(400, "workspaceId is required");
    }
    const templates = await listOrgMessageTemplates({
      kind: req.nextUrl.searchParams.get("kind"),
      user,
      workspaceId,
    });
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    content: z.record(z.string(), z.unknown()),
    id: z.string().uuid().nullish(),
    kind: z.string(),
    name: z.string(),
    workspaceId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new OrgHttpError(400, "Invalid template");
    const body = parsed.data;
    if (body.action === "delete") {
      await deleteOrgMessageTemplate({
        id: body.id,
        user,
        workspaceId: body.workspaceId,
      });
      return NextResponse.json({ ok: true });
    }
    const template = await saveOrgMessageTemplate({ ...body, user });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return toErrorResponse(error);
  }
}
