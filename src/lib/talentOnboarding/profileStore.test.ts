import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRowMemoOperation,
  buildTalentProfileContext,
  MEMO_MAX_CHARS,
} from "@/lib/talentOnboarding/profileStore";
import type { TalentUserProfileRow } from "@/lib/talentOnboarding/models";

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

test("does not append an exact duplicate row memo", () => {
  assert.equal(
    applyRowMemoOperation({
      existing: "같은 메모",
      memo: "같은 메모",
      operation: "append",
    }),
    "같은 메모"
  );

  assert.equal(
    applyRowMemoOperation({
      existing: "기존 메모\n마지막 메모",
      memo: "마지막 메모",
      operation: "append",
    }),
    "기존 메모\n마지막 메모"
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

test("exposes education descriptions to the LLM context", () => {
  const context = buildTalentProfileContext({
    profile: null,
    structuredProfile: {
      talentUser: null,
      talentExperiences: [],
      talentEducations: [
        {
          created_at: "2026-08-26T00:00:00.000Z",
          degree: "학사",
          description: "분산 시스템 연구실에서 학부 연구생으로 활동했습니다.",
          end_date: "2024-02",
          field: "컴퓨터공학",
          id: 42,
          memo: null,
          school: "하퍼대학교",
          start_date: "2020-03",
          talent_id: "talent-1",
          url: null,
        },
      ],
      talentExtras: [],
    },
  });

  assert.match(
    context,
    /Description: 분산 시스템 연구실에서 학부 연구생으로 활동했습니다\./
  );
});

test("does not split a styled Unicode character in profile context", () => {
  const prefix = "a".repeat(1199);
  const context = buildTalentProfileContext({
    profile: {
      bio: `${prefix}\u{1d600}tail`,
    } as TalentUserProfileRow,
  });

  assert.match(context, new RegExp(`Bio: ${prefix}$`, "m"));
  assert.doesNotMatch(JSON.stringify(context), /\\ud835/i);
});
