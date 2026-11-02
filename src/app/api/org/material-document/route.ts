import type { NextRequest } from "next/server";
import {
  requireAuthenticatedUser,
  getSupabaseAdmin,
} from "@/lib/server/candidateAccess";
import { fetchOrgTalentDetail, OrgHttpError } from "@/lib/org/server";
import { resolveRoleSharedMaterials } from "@/lib/career/roleMaterials/store";
import { exportRoleMaterialDocument } from "@/lib/career/roleMaterials/export";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req),
      admin = getSupabaseAdmin();
    const value = (name: string) => req.nextUrl.searchParams.get(name) ?? "";
    const workspaceId = value("workspaceId"),
      talentId = value("talentId"),
      roleId = value("roleId");
    await fetchOrgTalentDetail({ admin, user, workspaceId, talentId, roleId });
    const material = await resolveRoleSharedMaterials({
      admin,
      userId: talentId,
      roleId,
      workspaceId,
    });
    if (!material || material.id !== value("materialId"))
      throw new OrgHttpError(404, "Document not found");
    const artifact = await exportRoleMaterialDocument({
      admin,
      material,
      documentId: value("documentId"),
    });
    // Recheck visibility after rendering, before sending any bytes.
    await fetchOrgTalentDetail({ admin, user, workspaceId, talentId, roleId });
    return new Response(new Uint8Array(artifact.bytes), {
      headers: {
        "Content-Type": artifact.contentType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: "Document unavailable" },
      {
        status: error instanceof OrgHttpError ? error.status : 500,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}
