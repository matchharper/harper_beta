import test from "node:test";
import assert from "node:assert/strict";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { resolveCareerChatTools } from "./llmTools";
import { CareerCapabilityRuntime } from "./capabilities/runtime";
import { sortCareerActionItems, type CareerActionItem } from "./actionItems";
import { createClient } from "@supabase/supabase-js";
import { createCareerCapabilityTurn } from "./capabilities/server";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";

const item: CareerActionItem = {
  id: "00000000-0000-4000-8000-000000000001",
  revision: 3,
  title: "지원서 확인",
  description: "두 곳의 지원서가 준비됐어요",
  buttonText: "내용 확인하기",
  action: { type: "send_message", text: "지원서 두 건을 보여줘" },
  priority: 3,
  urgency: "normal",
};
const promptArgs = {
  channel: "chat" as const,
  isOnboardingDone: true,
  profile: null,
  structuredProfileText: "",
  talentContextSection: "",
  actionItems: [item],
};

test("normal, return and background turns offer the tool cold and receive device-specific current items", () => {
  for (const isMobile of [true, false, undefined]) {
    for (const backgroundInvocation of [false, true]) {
      const selection = resolveCareerChatTools({
        isOnboardingDone: true,
        background: backgroundInvocation,
      });
      const runtime = new CareerCapabilityRuntime({
        mode: "progressive",
        eligibleTools: selection.tools,
        promptArgs: () => ({ ...promptArgs, isMobile, backgroundInvocation }),
      });
      const step = runtime.resolveStep(false);
      assert.ok(
        step.tools.some((tool) => tool.function.name === "manage_action_items")
      );
      const text = step.systemBlocks.map((block) => block.text).join("\n");
      assert.ok(text.includes(item.action.text));
      assert.ok(text.includes(item.id));
      assert.ok(
        text.includes(isMobile === true ? "홈 화면에서" : "홈의 오른쪽 패널")
      );
    }
  }
  const onboarding = buildCareerConversationPromptPlan({
    ...promptArgs,
    isOnboardingDone: false,
    toolNames: [],
  });
  assert.ok(
    !onboarding.promptBlocks.some((block) => block.key === "visible_actions")
  );
});

test("only priority controls order, including ties; no persisted item is hidden", () => {
  const items = Array.from({ length: 11 }, (_, i) => ({
    ...item,
    id: `id-${i}`,
    priority: i,
  }));
  items[9].priority = 10;
  items[9].urgency = "urgent";
  const ordered = sortCareerActionItems(items);
  assert.equal(ordered.length, 11);
  assert.equal(ordered[0].id, "id-10");
  assert.equal(ordered[1].id, "id-9");
  items[0].urgency = "urgent";
  assert.equal(sortCareerActionItems(items).at(-1)?.id, "id-0");
  assert.equal(items[0].id, "id-0");
});

test("provider input preserves the guide and distinguishes empty, unavailable and empty fields", () => {
  for (const actionItems of [[], null, [{ ...item, description: "" }]]) {
    const runtime = new CareerCapabilityRuntime({
      mode: "progressive",
      eligibleTools: resolveCareerChatTools({ isOnboardingDone: true }).tools,
      promptArgs: () => ({ ...promptArgs, actionItems, isMobile: false }),
    });
    const text = runtime
      .resolveStep(false)
      .systemBlocks.map((block) => block.text)
      .join("\n");
    assert.ok(text.includes("## Visible actions"));
    assert.ok(text.includes("## Current visible actions"));
    assert.ok(
      text.includes("이 목록은 홈의 오른쪽 패널에서 유저에게 보여진다.")
    );
    if (actionItems === null) {
      assert.ok(
        text.includes(
          "The current list could not be loaded. Use manage_action_items list before changing it."
        )
      );
      assert.ok(!text.includes("No current items."));
    } else if (!actionItems.length) {
      assert.ok(text.includes("No current items."));
    } else {
      assert.ok(text.includes("Description: \nButton: 내용 확인하기"));
      assert.ok(text.includes("Click sends: 지원서 두 건을 보여줘"));
      assert.ok(!text.includes('"buttonText":'));
    }
  }
});

test("a real capability turn reads the owner's list and refreshes the next provider input after mutation", async () => {
  let rows = [{ ...item, button_text: item.buttonText }];
  let reads = 0;
  const admin = createClient("https://test.invalid", "test-key", {
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, "/rest/v1/career_action_items");
        assert.equal(url.searchParams.get("user_id"), "eq.owner");
        assert.equal(url.searchParams.get("deleted_at"), "is.null");
        reads++;
        return Response.json(rows);
      },
    },
  }) as TalentAdminClient;
  const turn = await createCareerCapabilityTurn({
    admin,
    userId: "owner",
    conversationId: "conversation",
    sourceMessage: {
      id: 1,
      user_id: "owner",
      conversation_id: "conversation",
      role: "user",
      content: "확인할게요",
      payload: {},
      is_mobile: true,
    } as TalentMessageRow,
    mode: "progressive",
    promptArgs: {
      ...promptArgs,
      careerCoachingActivity: null,
      actionItems: [],
    },
    eligibleTools: resolveCareerChatTools({ isOnboardingDone: true }).tools,
    selectionSnapshot: {
      capabilityIds: [],
      handbookIds: [],
      status: "selected",
      elapsedMs: 0,
    },
  });
  const before = turn.runtime.resolveStep(false);
  const input = before.systemBlocks.map((block) => block.text).join("\n");
  assert.ok(input.includes(item.title));
  assert.ok(input.includes("홈 화면에서"));
  rows = [];
  await turn.runtime.recordResult(
    "manage_action_items",
    { status: "deleted", item: null },
    before
  );
  const after = turn.runtime
    .resolveStep(false)
    .systemBlocks.map((block) => block.text)
    .join("\n");
  assert.ok(after.includes("No current items."));
  assert.ok(!after.includes(item.title));
  assert.equal(reads, 2);
});
