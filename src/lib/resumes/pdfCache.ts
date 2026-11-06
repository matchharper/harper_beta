import { createHash, randomUUID } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import manifest from "./assetManifest.json";

export type PdfArtifact = { pdf: Buffer; pageCount: number };
export type PdfCacheIdentity = { userId: string; documentId: string; revision: number | null };
export type PdfArtifactCache = {
  getOrCreate: (identity: PdfCacheIdentity, inputHash: string, render: () => Promise<PdfArtifact>) => Promise<PdfArtifact>;
};
export type PdfRenderContext = { cache?: PdfArtifactCache; document: PdfCacheIdentity };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** Authorization stays with the exporter: read/verify access before AND after
 * calling this cache. Immutable accepted material snapshots use their own scope.
 * The existing service-only operation table owns the file hash; bucket objects
 * alone (which an owner can upload) are never trusted as generated PDFs.
 */
export function createPdfArtifactCache(admin: TalentAdminClient): PdfArtifactCache {
  const pending = new Map<string, Promise<PdfArtifact>>();
  const table = () => admin.from("talent_external_operations" as any) as any;
  const bucket = () => admin.storage.from(TALENT_RESUME_BUCKET);
  return {
    getOrCreate(identity, inputHash, render) {
      const key = hash(JSON.stringify({ userId: identity.userId, documentId: identity.documentId,
        revision: identity.revision, inputHash, assets: manifest.version }));
      const existing = pending.get(key);
      if (existing) return existing;
      const work = async () => {
        const read = async () => {
          const { data, error } = await table().select("request,result,provider_refs,status")
            .eq("user_id", identity.userId).eq("kind", "pdf_artifact").eq("idempotency_key", key).maybeSingle();
          if (error) throw error;
          return data;
        };
        const download = async (saved: any): Promise<PdfArtifact> => {
          if (saved.status !== "ready" || saved.request.inputHash !== inputHash || saved.request.document_id !== identity.documentId ||
              saved.request.revision !== identity.revision || saved.request.assets !== manifest.version)
            throw new Error("PDF cache identity mismatch");
          const { data, error } = await bucket().download(saved.provider_refs.storage_path);
          if (error || !data) throw error ?? new Error("Cached PDF unavailable");
          const pdf = Buffer.from(await data.arrayBuffer());
          if (hash(pdf) !== saved.result.contentHash || pdf.subarray(0, 5).toString() !== "%PDF-" ||
              !Number.isSafeInteger(saved.result.pageCount) || saved.result.pageCount < 1)
            throw new Error("Cached PDF integrity mismatch");
          return { pdf, pageCount: saved.result.pageCount };
        };
        const saved = await read();
        if (saved) return download(saved);
        const artifact = await render();
        const path = `${identity.userId}/pdf-artifacts/${identity.documentId}/${randomUUID()}.pdf`;
        const upload = await bucket().upload(path, artifact.pdf, { contentType: "application/pdf", upsert: false });
        if (upload.error) throw upload.error;
        const { error } = await table().insert({
          user_id: identity.userId, conversation_id: null, kind: "pdf_artifact", idempotency_key: key, status: "ready",
          request: { document_id: identity.documentId, revision: identity.revision, inputHash, assets: manifest.version },
          result: { contentHash: hash(artifact.pdf), pageCount: artifact.pageCount }, provider_refs: { storage_path: path },
        });
        if (!error) return artifact;
        // Concurrent requests may render, but only the first published bytes are
        // returned by every caller. Never overwrite an existing immutable file.
        if (error.code !== "23505") throw error;
        await bucket().remove([path]);
        const winner = await read();
        if (!winner) throw new Error("Cached PDF was not persisted");
        return download(winner);
      };
      const result = work().finally(() => pending.delete(key));
      pending.set(key, result);
      return result;
    },
  };
}
