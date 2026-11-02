import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { resolveRoleSharedMaterials } from "@/lib/career/roleMaterials/store";
import { exportRoleMaterialDocument } from "@/lib/career/roleMaterials/export";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { readOrgSharedGeneratedResume, OrgHttpError } from "@/lib/org/server";
import { readResumeContent, resumeFileName } from "@/lib/resumes/schema";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { exportResume, ResumeExportError } from "@/lib/resumes/export";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
const params = (req: NextRequest) => ({
  documentId: req.nextUrl.searchParams.get("documentId") ?? "",
  roleId: req.nextUrl.searchParams.get("roleId") ?? undefined,
  talentId: req.nextUrl.searchParams.get("talentId") ?? "",
  workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
});
function failure(error: unknown) {
  const status =
    error instanceof OrgHttpError || error instanceof ResumeExportError
      ? error.status
      : error instanceof Error && error.message === "Unauthorized"
        ? 401
        : 500;
  return Response.json({ error: "Document unavailable" }, { status, headers });
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const row = await readOrgSharedGeneratedResume({ ...params(req), user });
    return Response.json(
      {
        documentId: row.id,
        fileName: row.file_name,
        revision: row.revision,
        renderVersion: RESUME_RENDER_VERSION,
        content: readResumeContent(row.structured_content),
      },
      { headers }
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => null);
    if (
      !Number.isSafeInteger(body?.expected_revision) ||
      body.expected_revision < 1 ||
      typeof body.render_version !== "string"
    )
      return Response.json(
        { error: "Revision required" },
        { status: 400, headers }
      );
    const scope = params(req);
    const row = await readOrgSharedGeneratedResume({ ...scope, user });
    const material = scope.roleId ? await resolveRoleSharedMaterials({ admin: getSupabaseAdmin(), userId: scope.talentId, roleId: scope.roleId, workspaceId: scope.workspaceId }) : null;
    const snapshotArtifact = material ? await exportRoleMaterialDocument({ admin: getSupabaseAdmin(), material, documentId: row.id }) : null;
    const artifact = snapshotArtifact ? { pdf: snapshotArtifact.bytes, fileName: snapshotArtifact.fileName } : await exportResume({
      expectedRevision: body.expected_revision,
      renderVersion: body.render_version,
      read: () => readOrgSharedGeneratedResume({ ...params(req), user }),
    });
    if (snapshotArtifact) await readOrgSharedGeneratedResume({ ...scope, user });
    const name = encodeURIComponent(resumeFileName(artifact.fileName)).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16)}`
    );
    return new Response(new Uint8Array(artifact.pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume.pdf"; filename*=UTF-8''${name}`,
      },
    });
  } catch (error) {
    return failure(error);
  }
}
