import { createHash } from "node:crypto";
import { z } from "zod";
import { fetchTalentDocument } from "@/lib/talentOnboarding/documentStore";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import { GENERATED_RESUME_ORIGIN } from "@/lib/resumes/schema";
import { exportResume } from "@/lib/resumes/export";
import { createPdfArtifactCache } from "@/lib/resumes/pdfCache";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { AUTHORED_DOCUMENT_ORIGIN } from "@/lib/documents/authoring";
import { exportDocument } from "@/lib/documents/export";
import { DOCUMENT_RENDER_VERSION } from "@/lib/documents/template";
import {
  applicationAttachmentName,
  documentFingerprint,
} from "@/lib/career/simulation/resumeAttachment";
import { createOperation, readOperation, updateOperation, type ExternalToolContext } from "./store";
export const attachmentRefSchema = z.object({
  document_id: z.string().uuid(),
  revision: z.number().int().optional(),
  snapshot_id: z.string().uuid().optional(),
});
export type AttachmentRef = z.infer<typeof attachmentRefSchema>;
export async function prepareAttachments(
  context: Pick<ExternalToolContext, "admin" | "userId"> & Partial<Pick<ExternalToolContext, "conversationId" | "requestId" | "workId" | "userMessageId">>,
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
    if (reference.snapshot_id) {
      const pinned = await readPinnedAttachment(context, reference.snapshot_id);
      if (pinned.documentId !== doc.id || (reference.revision !== undefined && pinned.revision !== reference.revision))
        throw new Error("Attachment snapshot does not match the selected document revision");
      attachments.push(pinned);
      continue;
    }
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
          cache: createPdfArtifactCache(context.admin),
          read,
          expectedRevision: doc.revision!,
          renderVersion: RESUME_RENDER_VERSION,
        })
      ).pdf;
    else if (doc.origin_type === AUTHORED_DOCUMENT_ORIGIN)
      bytes = (
        await exportDocument({
          cache: createPdfArtifactCache(context.admin),
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
    const declaredMimeType = doc.content_type?.trim().toLowerCase();
    const genericMimeType = !declaredMimeType || ["application/octet-stream", "binary/octet-stream"].includes(declaredMimeType);
    const mimeType = generated || (genericMimeType && bytes.subarray(0, 5).toString("ascii") === "%PDF-")
      ? "application/pdf"
      : doc.content_type || "application/octet-stream";
    const file = {
      documentId: doc.id,
      revision: doc.revision,
      name: applicationAttachmentName(doc),
      mimeType,
      bytes,
      fingerprint,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
      snapshotId: undefined as string | undefined,
    };
    if (context.conversationId) {
      const scope = { ...context, conversationId: context.conversationId, requestId: context.requestId ?? `attachment:${doc.id}:${file.contentHash}` };
      let snapshot = await createOperation(scope, { kind: "attachment_snapshot",
        idempotencyKey: `${doc.id}:${doc.revision}:${file.contentHash}`, request: {
          document_id: doc.id, revision: doc.revision, name: file.name, mimeType: file.mimeType, fingerprint, contentHash: file.contentHash,
        } });
      if (snapshot.status !== "ready") {
        const path = `${context.userId}/agent-attachments/${snapshot.id}`;
        const upload = await context.admin.storage.from(TALENT_RESUME_BUCKET).upload(path, bytes, { contentType: file.mimeType, upsert: false });
        if (upload.error && !["409", "Duplicate"].includes(String((upload.error as any).statusCode ?? (upload.error as any).error))) throw upload.error;
        try {
          snapshot = await updateOperation(context, snapshot, { status: "ready", request: { ...snapshot.request, mimeType }, provider_refs: { storage_path: path } });
        } catch (error) {
          const current = await readOperation(context, snapshot.id);
          if (!current || current.status !== "ready" || current.request.contentHash !== file.contentHash) throw error;
          snapshot = current;
        }
      }
      file.snapshotId = snapshot.id;
    }
    attachments.push(file);
  }
  return attachments;
}

export async function readPinnedAttachmentReference(context: Pick<ExternalToolContext, "admin" | "userId">, snapshotId: string) {
  const snapshot = await readOperation(context, snapshotId);
  if (!snapshot || snapshot.kind !== "attachment_snapshot" || snapshot.status !== "ready") throw new Error("Attachment snapshot unavailable");
  // A retained file never bypasses explicit source deletion or ownership.
  const doc = await fetchTalentDocument({ admin: context.admin, userId: context.userId, documentId: String(snapshot.request.document_id) });
  if (!doc) throw new Error("Attachment source was removed");
  return { snapshot, documentId: doc.id, revision: snapshot.request.revision as number | null, name: String(snapshot.request.name) };
}

export async function readPinnedAttachment(context: Pick<ExternalToolContext, "admin" | "userId">, snapshotId: string) {
  const { snapshot, documentId, revision, name } = await readPinnedAttachmentReference(context, snapshotId);
  const { data, error } = await context.admin.storage.from(TALENT_RESUME_BUCKET).download(String(snapshot.provider_refs.storage_path));
  if (error || !data) throw new Error("Attachment snapshot unavailable");
  const bytes = Buffer.from(await data.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== snapshot.request.contentHash) throw new Error("Attachment snapshot integrity mismatch");
  return { documentId, revision, name, mimeType: String(snapshot.request.mimeType), bytes,
    fingerprint: String(snapshot.request.fingerprint), contentHash: String(snapshot.request.contentHash), snapshotId: snapshot.id };
}
