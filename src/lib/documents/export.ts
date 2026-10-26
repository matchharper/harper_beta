import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { ResumeExportError } from "@/lib/resumes/export";
import { resumeAssets } from "@/lib/resumes/assets";
import { paginatedPreviewHtml } from "@/lib/resumes/preview";
import { renderPaginatedPdf } from "@/lib/resumes/render";
import { AUTHORED_DOCUMENT_ORIGIN } from "./authoring";
import { DOCUMENT_RENDER_VERSION, documentTemplate } from "./template";

export async function renderAuthoredDocument(title: string, markdown: string) {
  const [template, assets] = await Promise.all([
    documentTemplate(title, markdown),
    resumeAssets(),
  ]);
  return renderPaginatedPdf({
    html: paginatedPreviewHtml(template.html, assets),
    textChunks: template.textChunks,
    text: markdown,
  });
}

export async function exportDocument(args: {
  expectedRevision: number;
  renderVersion: string;
  read: () => Promise<TalentDocumentRow | null>;
  render?: typeof renderAuthoredDocument;
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
    row.extracted_text ?? ""
  );
  const current = verify(await args.read());
  if (current.updated_at !== row.updated_at)
    throw new ResumeExportError(
      409,
      "Document changed. Reload the preview before downloading."
    );
  return { ...artifact, fileName: row.file_name };
}
