import {
  MAX_ROLE_CREATION_FILE_BYTES,
  MAX_ROLE_CREATION_FILES,
  MAX_ROLE_CREATION_TOTAL_FILE_BYTES,
  isRoleCreationFileMimeAllowed,
  isRoleCreationFileNameAllowed,
  isRoleCreationMediaMime,
} from "@/lib/org/agent/roleCreationDocumentTypes";
import type {
  OrgAgentMessageAttachment,
  OrgAgentMessageMetadata,
} from "@/lib/org/agent/types";
import type { ChatAttachmentPayload } from "@/types/chat";

const MAX_ATTACHMENT_TEXT_CHARS = 18_000;

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function validateOrgAgentReferenceAttachments(
  value: ChatAttachmentPayload[] | undefined
) {
  const attachments = Array.isArray(value) ? value : [];
  if (attachments.length > MAX_ROLE_CREATION_FILES) {
    throw new Error("한 번에 파일을 3개까지만 첨부할 수 있습니다.");
  }
  const totalBytes = attachments.reduce(
    (total, attachment) => total + Number(attachment.size ?? 0),
    0
  );
  if (
    !Number.isFinite(totalBytes) ||
    totalBytes > MAX_ROLE_CREATION_TOTAL_FILE_BYTES
  ) {
    throw new Error("첨부 파일의 전체 크기는 25MB 이하여야 합니다.");
  }
  return attachments.map((attachment) => {
    const name = text(attachment.name).slice(0, 240);
    const content = text(attachment.text);
    const size = Number(attachment.size ?? 0);
    if (
      attachment.kind !== "file" ||
      !name ||
      !isRoleCreationFileNameAllowed(name) ||
      !isRoleCreationFileMimeAllowed(name, attachment.mime) ||
      isRoleCreationMediaMime(attachment.mime)
    ) {
      throw new Error("지원하지 않는 첨부 파일입니다.");
    }
    if (
      !Number.isFinite(size) ||
      size <= 0 ||
      size > MAX_ROLE_CREATION_FILE_BYTES
    ) {
      throw new Error("파일은 10MB 이하여야 합니다.");
    }
    if (!content) {
      throw new Error("첨부 파일에 읽을 수 있는 텍스트가 없습니다.");
    }
    return {
      kind: "file" as const,
      mime: text(attachment.mime) || undefined,
      name,
      size,
      text: content.slice(0, MAX_ATTACHMENT_TEXT_CHARS),
      truncated:
        Boolean(attachment.truncated) ||
        content.length > MAX_ATTACHMENT_TEXT_CHARS,
      url: text(attachment.url) || undefined,
    };
  });
}

export function referenceAttachmentMetadata(
  attachments: ChatAttachmentPayload[]
): OrgAgentMessageAttachment[] {
  return attachments.map((attachment) => ({
    kind: attachment.kind,
    mime: attachment.mime,
    name: attachment.name,
    size: attachment.size,
    truncated: attachment.truncated,
    url: attachment.url,
  }));
}

export function referenceAttachmentsFromMetadata(
  metadata: OrgAgentMessageMetadata | undefined
) {
  return metadata?.slackFileAttachments ?? [];
}

export function formatCurrentReferenceAttachmentsForPrompt(
  attachments: ChatAttachmentPayload[]
) {
  if (attachments.length === 0) return "";
  return `<untrusted_current_attachments>${JSON.stringify(
    attachments.map((attachment, index) => ({
      index: index + 1,
      mime: attachment.mime ?? null,
      name: attachment.name,
      text: text(attachment.text).slice(0, 4_000),
      truncated:
        Boolean(attachment.truncated) || text(attachment.text).length > 4_000,
      url: attachment.url ?? null,
    }))
  )}</untrusted_current_attachments>`;
}
