import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRowMemoOperation,
  buildTalentProfileContext,
  MEMO_MAX_CHARS,
} from "@/lib/talentOnboarding/profileStore";

test("appends new row memo text after the existing memo", () => {
  assert.equal(
    applyRowMemoOperation({
      existing: "기존 메모",
      memo: "새 메모",
      operation: "append",
    }),
    "기존 메모\n새 메모"
  );
});

test("updates a row memo by replacing it with the complete final memo", () => {
  assert.equal(
    applyRowMemoOperation({
      existing: "기존 메모",
      memo: "수정된 전체 메모",
      operation: "update",
    }),
    "수정된 전체 메모"
  );
});

test("clears a row memo when update receives an empty string", () => {
  assert.equal(
    applyRowMemoOperation({
      existing: "기존 메모",
      memo: "",
      operation: "update",
    }),
    ""
  );
});

test("preserves multiline content and enforces the shared memo limit", () => {
  const multiline = "- 첫 번째\n- 두 번째";
  assert.equal(
    applyRowMemoOperation({
      existing: null,
      memo: multiline,
      operation: "update",
    }),
    multiline
  );

  assert.equal(
    applyRowMemoOperation({
      existing: null,
      memo: "a".repeat(MEMO_MAX_CHARS + 1),
      operation: "update",
    })?.length,
    MEMO_MAX_CHARS
  );
});

test("exposes row memos to the LLM context up to 2000 characters", () => {
  const memo = `${"a".repeat(MEMO_MAX_CHARS - 3)}END`;
  const context = buildTalentProfileContext({
    profile: null,
    structuredProfile: {
      talentUser: null,
      talentExperiences: [],
      talentEducations: [],
      talentExtras: [
        {
          title: "프로젝트",
          description: null,
          date: null,
          memo,
        },
      ],
    },
  });

  assert.match(context, new RegExp(`Memo: ${memo}$`));
});
