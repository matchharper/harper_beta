import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const composer = readFileSync(
  new URL("./CareerComposerSection.tsx", import.meta.url),
  "utf8"
);
const attachmentDraftList = readFileSync(
  new URL("../../chat/ChatAttachmentDraftList.tsx", import.meta.url),
  "utf8"
);
const chatHook = readFileSync(
  new URL("../../../hooks/career/useCareerChat.ts", import.meta.url),
  "utf8"
);
const chatRoute = readFileSync(
  new URL("../../../app/api/talent/chat/route.ts", import.meta.url),
  "utf8"
);
const documentUploadClient = readFileSync(
  new URL(
    "../../../lib/talentOnboarding/documentUploadClient.ts",
    import.meta.url
  ),
  "utf8"
);
const messageBubble = readFileSync(
  new URL("./CareerMessageBubble.tsx", import.meta.url),
  "utf8"
);
const orgMessageBubble = readFileSync(
  new URL("../../org/agent/OrgAgentMessage.tsx", import.meta.url),
  "utf8"
);
const messageModels = readFileSync(
  new URL("../../../lib/talentOnboarding/models.ts", import.meta.url),
  "utf8"
);

test("file selection remains local until the user sends the message", () => {
  assert.match(
    composer,
    /setPendingFileAttachment\(createDraftFileAttachment\(file\)\)/
  );
  assert.doesNotMatch(composer, /onUploadTalentDocument/);
  assert.match(composer, /files:[\s\S]*submittedFileAttachment\.file/);
  assert.match(composer, /<ChatAttachmentDraftList/);
  assert.match(
    attachmentDraftList,
    /tone === "light"[\s\S]*border border-neutral-1000-a05 bg-bg-floating/
  );
});

test("send uploads files before chat and passes exact document ids", () => {
  const uploadIndex = chatHook.indexOf(
    "const uploadPayload = await uploadTalentDocument"
  );
  const chatIndex = chatHook.indexOf('"/api/talent/chat"');
  assert.ok(uploadIndex >= 0);
  assert.ok(chatIndex > uploadIndex);
  assert.match(chatHook, /source: "chat"/);
  assert.match(documentUploadClient, /const formData = new FormData\(\)/);
  assert.match(
    documentUploadClient,
    /fetchWithAuth\("\/api\/talent\/documents\/upload"/
  );
  assert.doesNotMatch(documentUploadClient, /uploadToSignedUrl/);
  assert.doesNotMatch(documentUploadClient, /documents\/upload\/prepare/);
  assert.match(chatHook, /uploadedDocumentIds\.push\(documentId\.trim\(\)\)/);
  assert.match(chatHook, /uploadedDocumentIds,/);
});

test("uploaded document context is verified and used only in the current route call", () => {
  assert.match(chatRoute, /normalizeUploadedDocumentIds/);
  assert.match(chatRoute, /fetchTalentDocumentsByIds/);
  assert.match(chatRoute, /buildFirstTurnUploadedDocumentContext/);
  assert.match(
    chatRoute,
    /runtimeInstruction = \[[\s\S]*uploadedDocumentRuntimeInstruction/
  );
});

test("sent files persist on the user message and share the org attachment UI", () => {
  assert.match(chatHook, /attachments: optimisticAttachments/);
  assert.match(
    chatRoute,
    /appendCareerMessageAttachmentMetadata\([\s\S]*uploadedDocuments\.map/
  );
  assert.match(messageModels, /extractCareerMessageAttachments/);
  assert.match(messageModels, /attachments\.length > 0 \? \{ attachments \}/);
  assert.match(messageBubble, /<ChatMessageAttachmentList/);
  assert.match(orgMessageBubble, /<ChatMessageAttachmentList/);
  assert.ok(
    messageBubble.indexOf("<ChatMessageAttachmentList") <
      messageBubble.indexOf("<ChatMessageBubbleFrame")
  );
});
