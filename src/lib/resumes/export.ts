import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { GENERATED_RESUME_ORIGIN, readResumeContent } from "./schema";
import { RESUME_RENDER_VERSION } from "./template";
import { renderResumePdf } from "./render";

export class ResumeExportError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function exportResume(args: {
  expectedRevision: number;
  renderVersion: string;
  // Must recheck owner access or company permissions/public visibility on each read,
  // and exclude deleted documents.
  read: () => Promise<TalentDocumentRow | null>;
  render?: typeof renderResumePdf;
}) {
  const verify = (document: TalentDocumentRow | null) => {
    if (
      !document ||
      document.is_deleted ||
      document.origin_type !== GENERATED_RESUME_ORIGIN
    )
      throw new ResumeExportError(404, "Document not found");
    if (
      document.revision !== args.expectedRevision ||
      args.renderVersion !== RESUME_RENDER_VERSION
    )
      throw new ResumeExportError(
        409,
        "Document changed. Reload the preview before downloading."
      );
    return document;
  };
  const document = verify(await args.read());
  let content;
  try {
    content = readResumeContent(document.structured_content);
  } catch {
    throw new ResumeExportError(422, "Editable resume content unavailable");
  }
  const artifact = await (args.render ?? renderResumePdf)(content);
  verify(await args.read());
  return { ...artifact, fileName: document.file_name };
}
