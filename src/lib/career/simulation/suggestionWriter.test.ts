import assert from "node:assert/strict";
import test from "node:test";
import { CLAUDE_HAIKU_MODEL, GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { DEFAULT_CAREER_TEXT_CHAT_MODEL } from "../textChatModelConfig";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  suggestionsOutputSchema,
  writeApplicationSuggestions,
} from "./suggestionWriter";

test("suggestions use the shared chat default and inherit model-specific settings", async () => {
  for (const model of [undefined, CLAUDE_HAIKU_MODEL, GPT_6_LUNA_MODEL]) {
    let calls = 0;
    const result = await writeApplicationSuggestions(
      {
        admin: {} as TalentAdminClient,
        userId: "fixture",
        candidate: "Known profile",
        resume: "Original resume",
        role: "Role",
        application: "No extra materials",
        language: "English",
        model,
      },
      async (request) => {
        calls++;
        const finish = request.tools?.find(
          (tool) => tool.function.name === "finish_application_suggestions"
        );
        assert.equal(
          (
            finish?.function.parameters as {
              properties: { suggestions: { maxItems: number } };
            }
          ).properties.suggestions.maxItems,
          10
        );
        assert.equal(
          request.modelConfig?.primaryModel,
          model ?? DEFAULT_CAREER_TEXT_CHAT_MODEL
        );
        assert.equal(
          request.openAIResponsesReasoningEffort,
          model === GPT_6_LUNA_MODEL ? "xhigh" : undefined
        );
        assert.equal(
          request.modelConfig?.fallbackModel,
          undefined,
          "Use the common conversation fallback policy"
        );
        await request.executeTool({
          name: "finish_application_suggestions",
          input: { suggestions: [] },
        });
        return "";
      }
    );
    assert.equal(calls, 1);
    assert.deepEqual(result, []);
  }
});

test("initial batch limits questions to three, resume changes to seven, and all types to ten without a minimum", () => {
  const question = {
    kind: "question",
    title: "Which result can you support?",
    reason: "The role needs evidence of impact.",
  };
  const change = {
    kind: "change",
    title: "Clarify ownership",
    reason: "The role needs API ownership.",
    edits: [
      {
        target: "Experience",
        originalText: "Built APIs",
        suggestedText: "Owned internal APIs",
      },
    ],
  };
  const material = {
    kind: "material",
    title: "Review motivation",
    reason: "Required application answer.",
    applicationField: "Motivation",
    draftText: "I enjoy building developer tools.",
  };
  for (const [questions, changes, materials, valid] of [
    [3, 7, 0, true],
    [3, 6, 1, true],
    [4, 0, 0, false],
    [0, 8, 0, false],
    [3, 7, 1, false],
    [1, 0, 0, true],
    [0, 0, 0, true],
  ] as const) {
    assert.equal(
      suggestionsOutputSchema.safeParse({
        suggestions: [
          ...Array(questions).fill(question),
          ...Array(changes).fill(change),
          ...Array(materials).fill(material),
        ],
      }).success,
      valid,
      `${questions} questions, ${changes} changes, ${materials} materials`
    );
  }
});
