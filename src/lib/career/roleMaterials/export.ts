import { createHash, randomUUID } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import {
  GENERATED_RESUME_ORIGIN,
  readResumeContent,
} from "@/lib/resumes/schema";
import { renderResumePdf } from "@/lib/resumes/render";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { AUTHORED_DOCUMENT_ORIGIN } from "@/lib/documents/authoring";
import { renderAuthoredDocument } from "@/lib/documents/export";
import { DOCUMENT_RENDER_VERSION } from "@/lib/documents/template";
import type { RoleMaterial } from "./store";
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

/** Material files are immutable and scoped by pair; never re-read mutable document rows. */
export async function exportRoleMaterialDocument(args: {
  admin: TalentAdminClient;
  material: RoleMaterial;
  documentId: string;
}) {
  const document = args.material.documents.find(
    (row) => row.id === args.documentId
  );
  if (!document)
    throw new Error("Document is not part of these accepted materials.");
  const table = () =>
    args.admin.from("talent_role_material_files" as any) as any;
  const readFile = async () => {
    const { data, error } = await table()
      .select("*")
      .eq("material_id", args.material.id)
      .eq("document_id", document.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  };
  let stored = await readFile();
  if (!stored) {
    let bytes: Buffer, rendererVersion: string;
    if (document.origin_type === GENERATED_RESUME_ORIGIN) {
      bytes = (
        await renderResumePdf(readResumeContent(document.structured_content))
      ).pdf;
      rendererVersion = RESUME_RENDER_VERSION;
    } else if (document.origin_type === AUTHORED_DOCUMENT_ORIGIN) {
      bytes = (
        await renderAuthoredDocument(
          document.file_name,
          document.extracted_text ?? ""
        )
      ).pdf;
      rendererVersion = DOCUMENT_RENDER_VERSION;
    } else if (document.storage_path) {
      const { data, error } = await args.admin.storage
        .from(TALENT_RESUME_BUCKET)
        .download(document.storage_path);
      if (error || !data)
        throw error ?? new Error("Stored source file unavailable.");
      bytes = Buffer.from(await data.arrayBuffer());
      rendererVersion = "uploaded-file";
    } else throw new Error("This material has no downloadable file.");
    const contentHash = hash(
      JSON.stringify({
        revision: document.revision,
        content: document.structured_content,
        text: document.extracted_text,
        source: document.content_sha256,
      })
    );
    const fileHash = hash(bytes),
      path = `${args.material.talent_id}/role-materials/${args.material.id}/${document.id}/${randomUUID()}`;
    const { error: uploadError } = await args.admin.storage
      .from(TALENT_RESUME_BUCKET)
      .upload(path, bytes, {
        contentType:
          document.origin_type === GENERATED_RESUME_ORIGIN ||
          document.origin_type === AUTHORED_DOCUMENT_ORIGIN
            ? "application/pdf"
            : (document.content_type ?? "application/octet-stream"),
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { error } = await table().insert({
      material_id: args.material.id,
      document_id: document.id,
      content_hash: contentHash,
      renderer_version: rendererVersion,
      storage_path: path,
      file_hash: fileHash,
    });
    if (error && error.code !== "23505") throw error;
    if (error)
      await args.admin.storage.from(TALENT_RESUME_BUCKET).remove([path]);
    stored = await readFile();
  }
  if (!stored) throw new Error("Material file was not persisted.");
  const { data, error } = await args.admin.storage
    .from(TALENT_RESUME_BUCKET)
    .download(stored.storage_path);
  if (error || !data) throw error ?? new Error("Material file unavailable.");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (hash(bytes) !== stored.file_hash)
    throw new Error("Material file integrity mismatch.");
  return {
    bytes,
    fileName: document.file_name,
    contentType:
      stored.renderer_version === "uploaded-file"
        ? (document.content_type ?? "application/octet-stream")
        : "application/pdf",
  };
}
