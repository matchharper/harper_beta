import type { DraftChatAttachment } from "@/lib/chat/attachmentClient";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  MAX_ROLE_CREATION_FILE_BYTES,
  MAX_ROLE_CREATION_FILES,
  MAX_ROLE_CREATION_TOTAL_FILE_BYTES,
  ROLE_CREATION_FILE_ACCEPT,
  isRoleCreationFileMimeAllowed,
  isRoleCreationFileNameAllowed,
  isRoleCreationMediaMime,
} from "@/lib/org/agent/roleCreationDocumentTypes";
import type { ChatAttachmentPayload } from "@/types/chat";

export function validateRoleCreationDraftAttachments(
  attachments: DraftChatAttachment[]
) {
  const files = attachments.filter(
    (
      attachment
    ): attachment is Extract<DraftChatAttachment, { kind: "file" }> =>
      attachment.kind === "file"
  );
  if (files.length > MAX_ROLE_CREATION_FILES) {
    throw new Error("파일은 한 번에 3개까지 첨부할 수 있습니다.");
  }
  if (
    files.reduce((total, attachment) => total + attachment.size, 0) >
    MAX_ROLE_CREATION_TOTAL_FILE_BYTES
  ) {
    throw new Error("첨부 파일의 전체 크기는 25MB 이하여야 합니다.");
  }
  for (const attachment of files) {
    if (!isRoleCreationFileNameAllowed(attachment.name)) {
      throw new Error(`${attachment.name}: 지원하지 않는 파일 형식입니다.`);
    }
    if (!isRoleCreationFileMimeAllowed(attachment.name, attachment.mime)) {
      throw new Error(`${attachment.name}: 파일 형식과 MIME이 일치하지 않습니다.`);
    }
    if (attachment.size <= 0) {
      throw new Error(`${attachment.name}: 빈 파일은 첨부할 수 없습니다.`);
    }
    if (attachment.size > MAX_ROLE_CREATION_FILE_BYTES) {
      throw new Error(`${attachment.name}: 파일은 10MB 이하여야 합니다.`);
    }
    if (isRoleCreationMediaMime(attachment.mime)) {
      throw new Error(
        `${attachment.name}: 이미지·영상·음성은 첨부할 수 없습니다.`
      );
    }
  }
  return files;
}

export async function readRoleCreationAttachments(args: {
  attachments: DraftChatAttachment[];
  workspaceId: string;
}): Promise<ChatAttachmentPayload[]> {
  const files = validateRoleCreationDraftAttachments(args.attachments);
  return Promise.all(
    files.map(async (attachment) => {
      const form = new FormData();
      form.append("file", attachment.file);
      form.append("workspaceId", args.workspaceId);
      const result = await fetchWithInternalAuth<{
        ok: true;
        text: string;
        truncated: boolean;
      }>("/api/org/agent/role-creation/extract-file", {
        body: form,
        method: "POST",
      });
      return {
        kind: "file" as const,
        mime: attachment.mime,
        name: attachment.name,
        size: attachment.size,
        text: result.text,
        truncated: result.truncated,
      };
    })
  );
}
