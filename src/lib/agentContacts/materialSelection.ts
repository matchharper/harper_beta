import { encodeMaterialSelection } from "./contracts";

/** The same version reference is displayed, submitted and verified at the sharing transaction. */
export async function readAcceptanceSelections(
  admin: any,
  talentId: string,
  roleIds: string[]
) {
  if (!roleIds.length)
    return new Map<
      string,
      {
        materialId: string | null;
        assignmentRevision: number;
        selectionRef: string;
        profileTitle?: string;
        documentNames?: string[];
      }
    >();
  const [history, profile, documents] = await Promise.all([
    admin
      .from("talent_role_materials")
      .select("id,role_id,revision,action,source,profile_snapshot,documents")
      .eq("talent_id", talentId)
      .in("role_id", roleIds)
      .order("revision", { ascending: false }),
    admin.rpc("read_talent_profile_v1", {
      p_talent_id: talentId,
      p_profile_id: null,
      p_revision: null,
    }),
    admin
      .from("talent_documents")
      .select("id,revision,file_name")
      .eq("talent_id", talentId)
      .eq("is_public", true)
      .eq("is_deleted", false)
      .order("id"),
  ]);
  for (const read of [history, profile, documents])
    if (read.error) throw read.error;
  return new Map(
    roleIds.map((roleId) => {
      const rows = (history.data ?? []).filter(
        (m: any) => m.role_id === roleId
      );
      const prepared = rows.find(
        (m: any) => !m.source?.defaultAcceptance && !m.source?.agentSnapshot
      );
      const materialId = prepared?.action === "set" ? prepared.id : null;
      const assignmentRevision = Number(rows[0]?.revision ?? 0);
      const selectionRef = encodeMaterialSelection({
        materialId,
        assignmentRevision,
        ...(!materialId
          ? {
              profileId: profile.data.profileId,
              profileRevision: Number(profile.data.revision),
              documents: (documents.data ?? []).map((d: any) => ({
                documentId: d.id,
                revision: Number(d.revision ?? 1),
              })),
            }
          : {}),
      });
      return [
        roleId,
        {
          materialId,
          assignmentRevision,
          selectionRef,
          profileTitle: materialId
            ? (prepared.profile_snapshot?.talentUser?.headline ?? "")
            : profile.data.title,
          documentNames: (materialId
            ? prepared.documents
            : (documents.data ?? [])
          )
            .map((d: any) => d.file_name)
            .filter(Boolean),
        },
      ];
    })
  );
}
