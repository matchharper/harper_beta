import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveOrgAgentDraftMentions,
  serializeOrgAgentDraftMentions,
  splitOrgAgentMentionText,
} from "@/lib/org/agent/mentionText";
import type { OrgAgentMention } from "@/lib/org/agent/types";

const mentions: OrgAgentMention[] = [
  {
    displayName: "김하퍼",
    recommendationId: "recommendation-1",
    roleId: "role-1",
    talentId: "talent-1",
  },
];

test("serializes selected talent ids while retaining only visible mentions", () => {
  assert.deepEqual(
    serializeOrgAgentDraftMentions("  @김하퍼 님과 이야기해줘  ", mentions),
    {
      mentions,
      text: "@[김하퍼](talent:talent-1) 님과 이야기해줘",
    }
  );

  assert.deepEqual(
    serializeOrgAgentDraftMentions("다른 분을 찾아줘", mentions),
    {
      mentions: [],
      text: "다른 분을 찾아줘",
    }
  );
});

test("keeps draft whitespace and pairs duplicate names with their talent ids", () => {
  const duplicateNameMentions: OrgAgentMention[] = [
    { displayName: "Alex Kim", talentId: "talent-a" },
    { displayName: "Alex Kim", talentId: "talent-b" },
  ];

  assert.equal(
    resolveOrgAgentDraftMentions(
      "  @Alex Kim 그리고 @Alex Kim\n",
      duplicateNameMentions
    ).serializedText,
    "  @[Alex Kim](talent:talent-a) 그리고 @[Alex Kim](talent:talent-b)\n"
  );
});

test("renders only blue-label text segments without exposing talent ids", () => {
  const segments = splitOrgAgentMentionText(
    "@[김하퍼](talent:talent-1) 님과 @[Alex](talent:talent-2)"
  );

  assert.deepEqual(segments, [
    {
      displayName: "김하퍼",
      kind: "mention",
      talentId: "talent-1",
      text: "@김하퍼",
    },
    { kind: "text", text: " 님과 " },
    {
      displayName: "Alex",
      kind: "mention",
      talentId: "talent-2",
      text: "@Alex",
    },
  ]);
  assert.equal(
    segments.map((segment) => segment.text).join(""),
    "@김하퍼 님과 @Alex"
  );
});
