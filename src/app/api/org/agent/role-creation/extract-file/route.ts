import { NextRequest, NextResponse } from "next/server";
import {
  MAX_ROLE_CREATION_FILE_BYTES,
  extractRoleCreationDocument,
} from "@/lib/org/agent/roleCreationDocuments";
import {
  isRoleCreationFileNameAllowed,
  isRoleCreationFileMimeAllowed,
  isRoleCreationMediaMime,
} from "@/lib/org/agent/roleCreationDocumentTypes";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const form = await req.formData();
    const file = form.get("file");
    const workspaceId = String(form.get("workspaceId") ?? "").trim();
    if (!(file instanceof File) || !workspaceId) {
      return NextResponse.json(
        { error: "파일과 workspaceId가 필요합니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_ROLE_CREATION_FILE_BYTES) {
      return NextResponse.json(
        { error: "파일은 10MB 이하여야 합니다." },
        { status: 413 }
      );
    }
    if (
      !isRoleCreationFileNameAllowed(file.name) ||
      !isRoleCreationFileMimeAllowed(file.name, file.type) ||
      isRoleCreationMediaMime(file.type)
    ) {
      return NextResponse.json(
        { error: "지원하지 않는 파일 형식입니다." },
        { status: 415 }
      );
    }
    await assertOrgWorkspacePermission({
      admin: getSupabaseAdmin(),
      permission: "manage_candidates",
      user,
      workspaceId,
    });
    const extracted = await extractRoleCreationDocument({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name,
    });
    return NextResponse.json({ ok: true, ...extracted });
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "파일을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
