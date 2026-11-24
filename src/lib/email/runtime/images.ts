import type { CareerDocumentImage } from "@/lib/talentOnboarding/documentImages.server";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/talentOnboarding/documentUploadLimits";
import { TALENT_RESUME_BUCKET } from "@/lib/talentOnboarding/models";
import type { EmailAdmin, EmailAttachment } from "./types";

// Formats the shared Career image renderer decodes. Other files stay names only.
const VIEWABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function storageName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 120) || "image";
}

/**
 * Keeps the current email's images in private storage so this email's model
 * input can show them, as Career chat does for an uploaded image. The path is
 * fixed per inbound email and attachment, so a retried job overwrites the same
 * object. An image that cannot be stored or decoded stays a file name only.
 */
export async function storeEmailImageInputs(args: {
  admin: EmailAdmin;
  talentId: string;
  inboundId: string;
  attachments: EmailAttachment[];
  fetchImpl?: typeof fetch;
}): Promise<CareerDocumentImage[]> {
  const images: CareerDocumentImage[] = [];
  for (const [index, attachment] of args.attachments.entries()) {
    if (
      !VIEWABLE_IMAGE_TYPES.has(attachment.contentType.toLowerCase()) ||
      !/^https:\/\//i.test(attachment.downloadUrl) ||
      (attachment.size ?? 0) > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES
    )
      continue;
    try {
      const response = await (args.fetchImpl ?? fetch)(attachment.downloadUrl, {
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) throw new Error(`download HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) continue;
      const { default: sharp } = await import("sharp");
      // The renderer decodes it again for every model call; a file it cannot
      // decode would fail the whole reply instead of this one image.
      await sharp(bytes).stats();
      const path = `${args.talentId}/email-inbound/${args.inboundId}/${index + 1}-${storageName(attachment.filename)}`;
      const { error } = await args.admin.storage
        .from(TALENT_RESUME_BUCKET)
        .upload(path, bytes, { contentType: attachment.contentType, upsert: true });
      if (error) throw error;
      images.push({ path, name: attachment.filename });
    } catch (error) {
      console.warn("[email-image-input] image not shown to the model", {
        inboundId: args.inboundId,
        attachmentIndex: index + 1,
        contentType: attachment.contentType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return images;
}
