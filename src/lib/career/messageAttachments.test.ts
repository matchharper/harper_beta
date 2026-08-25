import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCareerMessageAttachmentMetadata,
  extractCareerMessageAttachments,
  formatCareerMessageAttachmentsForLlm,
  stripCareerMessageAttachmentMetadata,
} from "@/lib/career/messageAttachments";
import { appendCareerOpportunityMentionMetadata } from "@/lib/career/opportunityMentionText";
import { toTalentMessageResponse } from "@/lib/talentOnboarding/models";

const attachments = [
  {
    mime: "application/pdf",
    name: "resume.pdf",
    size: 1234,
  },
];

test("stores attachment presentation metadata outside visible message text", () => {
  const stored = appendCareerMessageAttachmentMetadata(
    "이 파일을 확인해줘",
    attachments
  );

  assert.deepEqual(extractCareerMessageAttachments(stored), attachments);
  assert.equal(
    stripCareerMessageAttachmentMetadata(stored),
    "이 파일을 확인해줘"
  );
  assert.doesNotMatch(stripCareerMessageAttachmentMetadata(stored), /1234/);
});

test("replaces user-supplied attachment markers with verified metadata", () => {
  const spoofed = appendCareerMessageAttachmentMetadata("hello", [
    { name: "spoofed.exe" },
  ]);
  const stored = appendCareerMessageAttachmentMetadata(spoofed, attachments);

  assert.deepEqual(extractCareerMessageAttachments(stored), attachments);
  assert.doesNotMatch(stored, /spoofed\.exe/);
});

test("formats only attachment names for later LLM history", () => {
  const formatted = formatCareerMessageAttachmentsForLlm(
    appendCareerMessageAttachmentMetadata("검토해줘", attachments)
  );

  assert.match(formatted, /Files attached to this user message/);
  assert.match(formatted, /resume\.pdf/);
  assert.doesNotMatch(formatted, /HARPER_CAREER_MESSAGE_ATTACHMENTS/);
});

test("serializes attachments while hiding both attachment and mention metadata", () => {
  const stored = appendCareerMessageAttachmentMetadata(
    appendCareerOpportunityMentionMetadata("같이 검토해줘", [
      { label: "Harper · Engineer", roleId: "role-123" },
    ]),
    attachments
  );
  const response = toTalentMessageResponse({
    content: stored,
    conversation_id: "conversation-1",
    created_at: "2026-08-21T00:00:00.000Z",
    id: 1,
    message_type: "chat",
    role: "user",
    user_id: "user-1",
  });

  assert.equal(response.content, "같이 검토해줘");
  assert.deepEqual(response.attachments, attachments);
});
