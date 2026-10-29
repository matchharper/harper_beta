import test from "node:test";
import assert from "node:assert/strict";
import { inspectApplicationQuestions } from "./applicationQuestions.server";
import { inspectionOutcome } from "./applicationQuestions";
import { inspectionSnapshotText } from "@/lib/career/simulation/applicationStagehand/inspectionText.mjs";
import type {
  applicationStagehandRuntime,
  StagehandStatus,
} from "@/lib/career/simulation/applicationStagehandRuntime";

for (const outcome of [
  "read",
  "partial",
  "unavailable",
  "error",
  "invalid",
] as const) {
  test(`questions reader preserves ${outcome} and releases the read-only Browserbase session`, async () => {
    let stopped = false;
    const state: StagehandStatus = {
      status: outcome === "error" ? "error" : "completed",
      sessionId: "fixture",
      steps: 1,
      maxSteps: 100,
      required_actions: [],
      error: outcome === "error" ? "Connection lost" : undefined,
      report:
        outcome === "error"
          ? undefined
          : outcome === "invalid"
            ? { questions: "not an array" }
            : {
                status: outcome,
                questions:
                  outcome === "unavailable"
                    ? []
                    : ["이름", "근무 가능한 지역은 어디인가요?"].map(
                        (label) => ({
                          label,
                          type: "text",
                          required: null,
                          options: [],
                          fileTypes: [],
                          multiple: null,
                          instructions: "",
                        })
                      ),
                limitations:
                  outcome === "read"
                    ? []
                    : ["로그인 후 다음 단계를 확인할 수 있습니다."],
              },
      snapshot: {
        url: "https://example.com/apply",
        title: "Apply",
        text: "",
        elements: [],
      },
    };
    const runtime: Pick<
      typeof applicationStagehandRuntime,
      "create" | "start" | "status" | "stop"
    > = {
      create: async (files, url, options) => {
        assert.deepEqual(files, []);
        assert.equal(options?.readOnly, true);
        assert.equal(options?.inspectionMode, "questions");
        assert.equal(options?.browserProvider, "browserbase");
        return {
          name: "fixture",
          provider: "browserbase",
          readOnly: true,
          expiresAt: "fixture",
        };
      },
      start: async () => {},
      status: async () => state,
      stop: async () => {
        stopped = true;
      },
    };
    if (outcome === "error" || outcome === "invalid") {
      await assert.rejects(
        inspectApplicationQuestions(
          "https://example.com",
          new AbortController().signal,
          runtime
        )
      );
    } else {
      const result = await inspectApplicationQuestions(
        "https://example.com",
        new AbortController().signal,
        runtime
      );
      assert.equal(result.status, outcome);
      assert.equal(result.url, "https://example.com/apply");
      assert.deepEqual(
        result.questions,
        (state.report as { questions: unknown[] }).questions
      );
    }
    assert.equal(stopped, true);
  });
}

test("empty or unavailable inventories never render as a successful retrieval", () => {
  assert.equal(
    inspectionOutcome("read", 0, "질문"),
    "지원 양식에서 질문을 찾지 못했습니다"
  );
  assert.equal(
    inspectionOutcome("unavailable", 0),
    "지원 양식을 가져오지 못했습니다"
  );
  assert.equal(
    inspectionOutcome("partial", 2),
    "일부만 가져왔습니다 · 항목 2개"
  );
});

test("model observation projects usable facts without dumping internal values", () => {
  const text = inspectionSnapshotText({
    url: "https://example.com",
    title: "Apply",
    text: "Where can you work?",
    internal: { unnecessary: "private-debug-data" },
    elements: [
      {
        ref: "uuid:7",
        label: "Location",
        type: "select",
        visible: true,
        requiredState: null,
        multiple: true,
        options: [{ label: "Seoul", value: "kr" }],
        pageIndex: 0,
        frameIndex: 1,
      },
    ],
  });
  assert.ok(text.includes("Ref uuid:7: Location"));
  assert.ok(text.includes("frame 1"));
  assert.ok(text.includes("Required: unknown"));
  assert.ok(text.includes("Multiple values/files: yes"));
  assert.ok(text.includes("Seoul (value: kr)"));
  assert.ok(!text.includes("private-debug-data"));
  assert.ok(!text.includes('"elements"'));
});
