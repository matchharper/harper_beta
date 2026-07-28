import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_DETAIL_MAX_LENGTH,
  parseAccountDeletionFeedback,
} from "./accountDeletionFeedback";

const submissionId = "a4de0068-da71-43a7-ab22-5a8f29f051da";

test("parses and normalizes valid account deletion feedback", () => {
  assert.deepEqual(
    parseAccountDeletionFeedback({
      detail: "  추천이 제 직무와 맞지 않았어요.  ",
      reasonCode: "recommendation_quality",
      submissionId,
    }),
    {
      detail: "추천이 제 직무와 맞지 않았어요.",
      reasonCode: "recommendation_quality",
      submissionId,
    }
  );
});

test("allows an empty optional reason and detail", () => {
  assert.deepEqual(
    parseAccountDeletionFeedback({
      detail: " ",
      reasonCode: "",
      submissionId,
    }),
    {
      detail: null,
      reasonCode: null,
      submissionId,
    }
  );
});

test("rejects unknown reasons, invalid submission ids, and oversized details", () => {
  assert.equal(
    parseAccountDeletionFeedback({
      reasonCode: "unknown",
      submissionId,
    }),
    null
  );
  assert.equal(
    parseAccountDeletionFeedback({
      reasonCode: "other",
      submissionId: "not-a-uuid",
    }),
    null
  );
  assert.equal(
    parseAccountDeletionFeedback({
      detail: "a".repeat(ACCOUNT_DELETION_DETAIL_MAX_LENGTH + 1),
      reasonCode: "other",
      submissionId,
    }),
    null
  );
});
