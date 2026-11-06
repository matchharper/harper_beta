import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { ResumeExportError } from "@/lib/resumes/export";
import { externalResumeAssets } from "@/lib/resumes/externalAssets";
import type { PdfArtifactCache, PdfRenderContext } from "@/lib/resumes/pdfCache";
import { paginatedPreviewHtml } from "@/lib/resumes/preview";
import { renderPaginatedPdf } from "@/lib/resumes/render";
import { AUTHORED_DOCUMENT_ORIGIN } from "./authoring";
import { DOCUMENT_RENDER_VERSION, documentTemplate } from "./template";

export async function renderAuthoredDocument(title: string, markdown: string, context?: PdfRenderContext) {
  const template = await documentTemplate(title, markdown);
  return renderPaginatedPdf({
    html: paginatedPreviewHtml(template.html, externalResumeAssets()),
    text: markdown,
    context,
  });
}

export async function exportDocument(args: {
  expectedRevision: number;
  renderVersion: string;
  read: () => Promise<TalentDocumentRow | null>;
  render?: typeof renderAuthoredDocument;
  cache?: PdfArtifactCache;
}) {
  const verify = (row: TalentDocumentRow | null) => {
    if (!row || row.is_deleted || row.origin_type !== AUTHORED_DOCUMENT_ORIGIN)
      throw new ResumeExportError(404, "Document not found");
    if (
      row.revision !== args.expectedRevision ||
      args.renderVersion !== DOCUMENT_RENDER_VERSION
    )
      throw new ResumeExportError(
        409,
        "Document changed. Reload the preview before downloading."
      );
    return row;
  };
  const row = verify(await args.read());
  const artifact = await (args.render ?? renderAuthoredDocument)(
    row.file_name,
    row.extracted_text ?? "",
    { cache: args.cache, document: { userId: row.talent_id, documentId: row.id, revision: row.revision ?? null } }
  );
  const current = verify(await args.read());
  if (current.updated_at !== row.updated_at)
    throw new ResumeExportError(
      409,
      "Document changed. Reload the preview before downloading."
    );
  return { ...artifact, fileName: row.file_name };
}
