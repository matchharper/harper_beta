import test from "node:test";
import assert from "node:assert/strict";
import { runQuestionsDebug } from "./applicationQuestionsDebug.server";
import {
  questionProviders,
  type ApplicationQuestions,
} from "./applicationQuestions";
import type { InspectionRole } from "./applicationFormInspection";
const source: InspectionRole = {
  id: "00000000-0000-4000-8000-000000000001",
  company: "Fixture",
  name: "Engineer",
  homepage: null,
  location: null,
  originalUrl: "https://mirror.example/job",
};
const result = (
  url: string,
  status: ApplicationQuestions["status"]
): ApplicationQuestions => ({
  status,
  url,
  questions: [],
  limitations: status === "unavailable" ? ["접근 실패"] : [],
});
for (const provider of questionProviders) {
  test(`${provider}: toggle off bypasses discovery and saving`, async () => {
    const actual = await runQuestionsDebug(
      {
        source: source.originalUrl!,
        provider,
        model: "fixture-model",
        resolveOfficialLink: false,
      },
      new AbortController().signal,
      {
        inspect: async (url, selected, model) => {
          assert.equal(url, source.originalUrl);
          assert.equal(selected, provider);
          assert.equal(model, "fixture-model");
          return result(url, "read");
        },
        resolution: {
          resolve: async () => {
            throw new Error("must not search");
          },
          save: async () => {
            throw new Error("must not save");
          },
          loadSource: async () => {
            throw new Error("must not load source");
          },
        },
      }
    );
    assert.equal(actual.linkResolution, undefined);
  });
  test(`${provider}: toggle on searches once and passes selected URL to chosen agent even when inspection fails`, async () => {
    const sequence: string[] = [];
    let count = 0;
    const actual = await runQuestionsDebug(
      {
        source: source.originalUrl!,
        provider,
        model: "fixture-model",
        resolveOfficialLink: true,
      },
      new AbortController().signal,
      {
        resolution: {
          loadSource: async (url) => {
            assert.equal(url, source.originalUrl);
            return source;
          },
          resolve: async ({ previous, onEvent }) => {
            count++;
            assert.equal(previous.attempts.length, count - 1);
            sequence.push("search");
            onEvent({ at: "fixture", kind: "search_start", message: "Search" });
            onEvent({
              at: "fixture",
              kind: "search_result",
              message: "Results",
              data: { costUsd: 0.01 },
            });
            return {
              query: "Fixture Engineer",
              selectedUrl: `https://official.example/job/${count}`,
              candidates: [],
              reason: "Same official role",
              durationMs: 1,
              costUsd: 0.01,
            };
          },
          save: async (role, expected, url) => {
            assert.equal(role.id, source.id);
            assert.equal(
              expected,
              source.originalUrl
            );
            assert.equal(url, `https://official.example/job/${count}`);
            sequence.push("save");
          },
        },
        inspect: async (url, selected) => {
          assert.equal(selected, provider);
          assert.equal(url, `https://official.example/job/${count}`);
          sequence.push("inspect");
          return {
            ...result(url, "unavailable"),
            execution: {
              provider,
              durationMs: 1,
              model: "fixture-model",
              runId: `run-${count}`,
              warnings: [],
            },
          };
        },
      }
    );
    assert.deepEqual(sequence, [
      "search",
      "save",
      "inspect",
    ]);
    assert.equal(count, 1);
    assert.equal(actual.status, "unavailable");
    assert.equal(actual.url, "https://official.example/job/1");
    assert.equal(actual.linkResolution?.savedUrl, actual.url);
    assert.equal(actual.linkResolution?.usage.searchCostUsd, 0.01);
    assert.deepEqual(
      actual.linkResolution?.attempts.map((a) => a.execution?.runId),
      ["run-1"]
    );
  });
}
test("no official candidate returns the search limitation without starting a paid agent", async () => {
  const actual = await runQuestionsDebug(
    {
      source,
      provider: "browser-use",
      model: "fixture",
      resolveOfficialLink: true,
    },
    new AbortController().signal,
    {
      resolution: {
        resolve: async () => ({
          query: "Fixture",
          selectedUrl: null,
          candidates: [],
          reason: "공식 공고 없음",
          durationMs: 0,
          costUsd: 0,
        }),
      },
      inspect: async () => {
        throw new Error("must not run");
      },
    }
  );
  assert.equal(actual.status, "unavailable");
  assert.ok(actual.limitations.includes("공식 공고 없음"));
});
