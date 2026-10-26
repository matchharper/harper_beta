import { z } from "zod";
import { createHash } from "node:crypto";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { exportResume } from "@/lib/resumes/export";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { AUTHORED_DOCUMENT_ORIGIN } from "@/lib/documents/authoring";
import { exportDocument } from "@/lib/documents/export";
import { DOCUMENT_RENDER_VERSION } from "@/lib/documents/template";

/** Public attachment basename; storage identifiers stay in the parent directory. */
export function applicationAttachmentName(doc: Partial<TalentDocumentRow>): string {
  const content = z.object({content: z.object({basics: z.object({name: z.string()})})}).safeParse(doc.structured_content);
  const safe = (value: string) => value.normalize("NFC").replace(/[\\/<>:"|?*\p{Cc}]/gu, "").replace(/\s+/g, "_").replace(/^\.+|\.+$/g, "").slice(0, 120);
  const name = content.success ? safe(content.data.content.basics.name) : "";
  const extension = doc.origin_type === GENERATED_RESUME_ORIGIN || doc.origin_type === AUTHORED_DOCUMENT_ORIGIN ? "pdf" : (doc.file_name?.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1].toLowerCase() || "pdf");
  if (doc.kind === "resume" && name) return `${name}_resume.${extension}`;
  const original = safe((doc.file_name ?? "").replace(/\.[a-zA-Z0-9]{1,10}$/, ""));
  const opaque = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(original);
  return `${original && !opaque ? original : doc.kind === "resume" ? "resume" : "supporting_document"}.${extension}`;
}

export function documentFingerprint(doc: Partial<TalentDocumentRow>) {
  return createHash("sha256").update(JSON.stringify({
    hash: doc.content_sha256, path: doc.storage_path,
    updatedAt: doc.updated_at, size: doc.size_bytes,
    revision: doc.revision, origin: doc.origin_type,
  })).digest("hex");
}

export async function applicationAttachment(args: {
  read: () => Promise<TalentDocumentRow | null>;
  download: (path: string) => Promise<Buffer>;
  render?: Parameters<typeof exportResume>[0]["render"];
  renderDocument?: Parameters<typeof exportDocument>[0]["render"];
}) {
  const doc = await args.read();
  if (!doc || doc.is_deleted) throw new Error("Selected attachment is unavailable");
  const fingerprint = documentFingerprint(doc);
  let bytes: Buffer;
  if (doc.origin_type === GENERATED_RESUME_ORIGIN) {
    if (typeof doc.revision !== "number") throw new Error("Resume revision unavailable");
    const artifact = await exportResume({read: args.read, expectedRevision: doc.revision,
      renderVersion: RESUME_RENDER_VERSION, render: args.render});
    bytes = artifact.pdf;
  } else if (doc.origin_type === AUTHORED_DOCUMENT_ORIGIN) {
    if (typeof doc.revision !== "number") throw new Error("Document revision unavailable");
    const artifact = await exportDocument({read: args.read, expectedRevision: doc.revision,
      renderVersion: DOCUMENT_RENDER_VERSION, render: args.renderDocument});
    bytes = artifact.pdf;
  } else {
    if (!doc.storage_path) throw new Error("Selected attachment is unavailable");
    bytes = await args.download(doc.storage_path);
  }
  const latest = await args.read();
  if (!latest || latest.is_deleted || documentFingerprint(latest) !== fingerprint)
    throw new Error("Attachment changed; confirm the latest file again");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw new Error("Attachment cannot be transferred (maximum 5 MiB)");
  return {bytes, document: doc, fingerprint,
    contentHash: createHash("sha256").update(bytes).digest("hex")};
}
