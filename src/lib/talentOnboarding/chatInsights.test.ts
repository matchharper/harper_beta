import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";

test("call completion extraction preserves the full transcript, including an unpaired last answer", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const load = modules._load;
  modules._load = function (request, ...rest) {
    if (
      request === "@/lib/career/llm" ||
      request === "@/lib/talentOnboarding/server"
    )
      return {};
    return load.call(this, request, ...rest);
  };
  try {
    const { buildExtractionConversationMessages } =
      await import("./chatInsights");
    const messages = [
      { role: "user" as const, content: "서울에서 일하고 싶어요." },
      ...Array.from({ length: 6 }, (_, i) => ({
        role: "assistant" as const,
        content: `earlier context ${i}`,
      })),
      { role: "user" as const, content: "영어로 회의할 수 있어요." },
    ];
    const full = buildExtractionConversationMessages({
      assistantContent: "",
      recentMessages: messages,
      includeFullTranscript: true,
    })[0].content;
    assert.ok(full.includes(messages[0].content));
    assert.ok(full.endsWith(messages.at(-1)!.content));
    assert.ok(full.includes("Use User lines as the source of truth"));
    const ordinary = buildExtractionConversationMessages({
      assistantContent: "잘 들었어요.",
      recentMessages: messages,
    })[0].content;
    assert.ok(!ordinary.includes(messages[0].content));
    assert.ok(ordinary.includes(messages.at(-1)!.content));
  } finally {
    modules._load = load;
  }
});
