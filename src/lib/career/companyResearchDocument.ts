import { createHash, randomUUID } from "node:crypto";
import { v5 as uuidv5 } from "uuid";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import type { CareerDocumentLink } from "./documentLinks";

/** Save the exact delivered report privately. Shared company snapshots never contain it. */
export async function saveCompanyResearchDocument(args: {
  admin: TalentAdminClient;
  userId: string;
  snapshotId: string;
  title: string;
  markdown: string;
}): Promise<CareerDocumentLink> {
  const hash = createHash("sha256").update(args.markdown).digest("hex");
  const stableId = uuidv5(
    `career-company-research:${args.userId}:${args.snapshotId}:${hash}`,
    uuidv5.URL
  );
  const existing = await fetchTalentDocument({
    admin: args.admin,
    documentId: stableId,
    userId: args.userId,
    includeDeleted: true,
  });
  if (existing && !existing.is_deleted)
    return { id: existing.id, title: existing.file_name };
  // An explicit new research request can create a new copy, but never restore a deleted document.
  const id = existing?.is_deleted ? randomUUID() : stableId;
  const { data, error } = await args.admin
    .from("talent_documents")
    .insert({
      id,
      talent_id: args.userId,
      kind: "document",
      file_name: args.title,
      storage_path: null,
      content_type: "text/markdown",
      content_sha256: hash,
      size_bytes: Buffer.byteLength(args.markdown, "utf8"),
      extracted_text: args.markdown,
      is_public: false,
      is_primary: false,
      is_deleted: false,
      origin_type: "company_research",
      // Each personalized report is an immutable origin, even when the company snapshot is reused.
      origin_id: id,
    })
    .select("id, file_name")
    .single();
  if (data && !error) return { id: data.id, title: data.file_name };
  if (error?.code === "23505") {
    const concurrent = await fetchTalentDocument({
      admin: args.admin,
      documentId: id,
      userId: args.userId,
    });
    if (concurrent) return { id: concurrent.id, title: concurrent.file_name };
  }
  throw new Error(error?.message ?? "Failed to save company research document");
}
