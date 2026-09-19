import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMockInterviewRoleIds,
  stripMockInterviewMarkers,
} from "./mockInterviewOffers";
import { hydrateMockInterviewOffers } from "./mockInterviewOffers.server";

const roleId = "11111111-1111-4111-8111-111111111111";
const unavailable = "22222222-2222-4222-8222-222222222222";
const marker = `[[MOCK_INTERVIEW:${roleId}]]`;

test("markers deduplicate roles and hide malformed and partial streaming markers", () => {
  assert.deepEqual(
    extractMockInterviewRoleIds(`${marker}${marker}[[MOCK_INTERVIEW:fake]]`),
    [roleId]
  );
  assert.equal(stripMockInterviewMarkers(`Practice?\n${marker}`), "Practice?");
  assert.equal(
    stripMockInterviewMarkers("Practice? [[MOCK_INTERVIEW:fake]]"),
    "Practice?"
  );
  for (let n = 2; n < marker.length; n++) {
    assert.equal(
      stripMockInterviewMarkers(`Practice? ${marker.slice(0, n)}`),
      "Practice?"
    );
  }
});

test("fresh and reloaded messages resolve only user-owned roles, with public card fields", async () => {
  const messages = [
    {
      role: "assistant",
      content: `${marker}${marker}[[MOCK_INTERVIEW:${unavailable}]]`,
    },
    { role: "user", content: marker },
  ];
  for (const sourceType of ["internal", "external", "manual"]) {
    const hydrated = await hydrateMockInterviewOffers(
      { admin: {} as never, userId: "owner", messages },
      async (args) => {
        assert.equal(args.userId, "owner");
        assert.deepEqual(args.roleIds, [roleId, unavailable]);
        return [
          {
            id: "opportunity-id",
            roleId,
            companyName: "Company",
            title: "Role",
            sourceType,
            privateNote: "secret",
          },
        ] as never;
      }
    );
    assert.deepEqual(hydrated[0].mockInterviewOffers, [
      { id: "opportunity-id", roleId, companyName: "Company", title: "Role" },
    ]);
    assert.deepEqual(hydrated[1].mockInterviewOffers, []);
    assert.equal(hydrated[0].content, messages[0].content);
    assert.ok(!JSON.stringify(hydrated).includes("secret"));
  }
});

test("lookup failure preserves text and returns no active offer; ordinary messages skip lookup", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const [result] = await hydrateMockInterviewOffers(
      {
        admin: {} as never,
        userId: "owner",
        messages: [{ role: "assistant", content: `Practice? ${marker}` }],
      },
      async () => {
        throw Error("unavailable");
      }
    );
    assert.equal(result.content, `Practice? ${marker}`);
    assert.deepEqual(result.mockInterviewOffers, []);
    await hydrateMockInterviewOffers(
      {
        admin: {} as never,
        userId: "owner",
        messages: [{ role: "assistant", content: "Hello" }],
      },
      async () => {
        assert.fail("unnecessary lookup");
      }
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("only chat gets offer instructions; voice keeps its existing policy", async () => {
  const { buildCareerConversationPromptPlan } =
    await import("./prompts/conversationPlan");
  for (const channel of ["chat", "voice"] as const) {
    const plan = buildCareerConversationPromptPlan({
      channel,
      isOnboardingDone: true,
      profile: null,
      structuredProfileText: "",
      talentContextSection: "",
      toolNames: ["get_role_context", "web_search"],
    });
    const offer = plan.promptBlocks.find(
      (block) => block.key === "mock_interview_offer"
    );
    assert.equal(Boolean(offer), channel === "chat");
    if (offer) {
      assert.match(offer.text, /\[\[MOCK_INTERVIEW:roleId\]\]/);
      assert.match(offer.text, /추천되었거나 저장된/);
      assert.match(offer.text, /선택을 묻는다/);
    }
  }
});
