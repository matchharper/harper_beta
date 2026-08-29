import assert from "node:assert/strict";
import test from "node:test";

import { extractMeetingInvitationPathFromQueuePayload } from "./invitationPath";

test("extracts only an internal meeting path from a queued invitation", () => {
  const token = "0123456789abcdefghijklmnopqrstuv";
  assert.equal(
    extractMeetingInvitationPathFromQueuePayload({
      body: `가능한 시간을 선택해 주세요. [일정 선택](https://matchharper.com/meeting/${token})`,
    }),
    `/meeting/${token}`
  );
});

test("rejects malformed, relative, and non-meeting URLs", () => {
  assert.equal(
    extractMeetingInvitationPathFromQueuePayload({
      body: "[일정 선택](/meeting/0123456789abcdefghijklmnopqrstuv)",
    }),
    null
  );
  assert.equal(
    extractMeetingInvitationPathFromQueuePayload({
      body: "https://example.com/profile/0123456789abcdefghijklmnopqrstuv",
    }),
    null
  );
  assert.equal(extractMeetingInvitationPathFromQueuePayload(null), null);
});
