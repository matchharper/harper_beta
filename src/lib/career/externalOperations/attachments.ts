import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { exportResume } from "@/lib/resumes/export";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { AUTHORED_DOCUMENT_ORIGIN } from "@/lib/documents/authoring";
import { exportDocument } from "@/lib/documents/export";
import { DOCUMENT_RENDER_VERSION } from "@/lib/documents/template";
import {
  applicationAttachmentName,
  documentFingerprint,
} from "@/lib/career/simulation/resumeAttachment";
import type { ExternalToolContext } from "./store";
export const attachmentRefSchema = z.object({
  document_id: z.string().uuid(),
  revision: z.number().int().optional(),
});
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;
export async function prepareAttachments(
  context: Pick<ExternalToolContext, "admin" | "userId">,
  references: AttachmentRef[]
) {
  const attachments = [];
  for (const reference of references) {
    const read = () =>
      fetchTalentDocument({
        admin: context.admin,
        userId: context.userId,
        documentId: reference.document_id,
      });
    const doc = await read();
    if (!doc) throw new Error("Attachment unavailable");
    if (reference.revision !== undefined && reference.revision !== doc.revision)
      throw new Error("Attachment revision changed");
    const fingerprint = documentFingerprint(doc);
    let bytes: Buffer;
    const generated =
      doc.origin_type === GENERATED_RESUME_ORIGIN ||
      doc.origin_type === AUTHORED_DOCUMENT_ORIGIN;
    if (doc.origin_type === GENERATED_RESUME_ORIGIN)
      bytes = (
        await exportResume({
          read,
          expectedRevision: doc.revision!,
          renderVersion: RESUME_RENDER_VERSION,
        })
      ).pdf;
    else if (doc.origin_type === AUTHORED_DOCUMENT_ORIGIN)
      bytes = (
        await exportDocument({
          read,
          expectedRevision: doc.revision!,
          renderVersion: DOCUMENT_RENDER_VERSION,
        })
      ).pdf;
    else {
      if (!doc.storage_path) throw new Error("Attachment file unavailable");
      const { data, error } = await context.admin.storage
        .from(TALENT_RESUME_BUCKET)
        .download(doc.storage_path);
      if (error || !data) throw new Error("Attachment download failed");
      bytes = Buffer.from(await data.arrayBuffer());
    }
    const latest = await read();
    if (!latest || documentFingerprint(latest) !== fingerprint)
      throw new Error("Attachment changed during export");
    if (!bytes.length) throw new Error("Attachment is empty");
    attachments.push({
      documentId: doc.id,
      revision: doc.revision,
      name: applicationAttachmentName(doc),
      mimeType: generated
        ? "application/pdf"
        : doc.content_type || "application/octet-stream",
      bytes,
      fingerprint,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return attachments;
}
