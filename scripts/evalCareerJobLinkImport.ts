import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const root = path.resolve("docs/evaluation/career-job-link-import");
  const read = (file: string) =>
    JSON.parse(readFileSync(path.join(root, file), "utf8"));
  const hash = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  const frozen = read("manifest-v1.json");
  for (const [file, digest] of Object.entries(frozen.files))
    assert.equal(hash(readFileSync(path.join(root, file), "utf8")), digest);
  const cases = read("cases-v1.json").cases,
    gold = read("gold-v1.json").cases;
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(root, "runs", runId);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const save = (file: string, value: unknown) =>
    writeFileSync(path.join(out, file), JSON.stringify(value, null, 2) + "\n", {
      mode: 0o600,
    });
  const requests: any[] = [],
    results: any[] = [];
  const model = "claude-haiku-5-5";
  const originalFetch = globalThis.fetch;
  let caseId = "";
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    );
    if (url.pathname.endsWith("/rest/v1/llm_logs")) return Response.json([]);
    if (url.hostname !== "api.anthropic.com")
      throw new Error(`Blocked evaluation network: ${url.hostname}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, model);
    requests.push({
      caseId,
      endpoint: `${url.origin}${url.pathname}`,
      promptFingerprint: hash(JSON.stringify(body)),
      body,
    });
    return originalFetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(90000)])
        : AbortSignal.timeout(90000),
    });
  };
  try {
    const { getExaClient } = await import("../src/lib/tools/exaClient");
    const { getEnabledTalentTools, getOpenAIChatTools } =
      await import("../src/lib/talentOnboarding/tools");
    const { buildCareerConversationPromptPlan } =
      await import("../src/lib/career/prompts/conversationPlan");
    const { runCareerChatAssistantStream } =
      await import("../src/lib/career/llm");
    const toolName = "save_job_posting";
    const tool = getEnabledTalentTools("chat").find(
      (tool) => tool.name === toolName
    )!;
    const tools = getOpenAIChatTools("chat").filter(
      (tool) => tool.function.name === toolName
    );
    const plan = buildCareerConversationPromptPlan({
      channel: "chat",
      isOnboardingDone: true,
      profile: null,
      talentContextSection: "",
      structuredProfileText: "",
      toolNames: [toolName],
      currentPreferences: { preferredLocale: "ko" },
      requestTime: new Date("2026-10-28T07:00:00Z"),
      timeZone: "Asia/Seoul",
    });
    const exa = getExaClient();
    for (const fixture of cases) {
      caseId = fixture.id;
      const calls: any[] = [],
        writes: any[] = [];
      exa.getContents = (async (
        _urls: unknown,
        options: { text?: unknown }
      ) => {
        if (!fixture.body)
          throw Object.assign(new Error("upstream retrieval unavailable"), {
            status: 503,
          });
        return {
          requestId: `fixture-${fixture.id}`,
          statuses: [{ status: "success", source: "cached" }],
          results: [
            {
              title: fixture.title,
              ...(options.text
                ? { text: fixture.body }
                : { summary: fixture.summary }),
            },
          ],
        };
      }) as typeof exa.getContents;
      const admin = {
        from: () => {
          const q = {
            select: () => q,
            eq: () => q,
            in: () => q,
            ilike: () => q,
            order: () => q,
            limit: () => q,
            maybeSingle: async () => ({ data: null, error: null }),
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve),
          };
          return q;
        },
        rpc: async (name: string, input: unknown) => {
          assert.equal(name, "import_talent_job_link");
          writes.push(input);
          return {
            data: {
              role_id: "00000000-0000-4000-8000-000000000123",
              recommendation_id: "00000000-0000-4000-8000-000000000456",
              saved_stage: "saved",
              created_recommendation: true,
            },
            error: null,
          };
        },
      };
      const response = await runCareerChatAssistantStream({
        primaryModel: model,
        tools,
        systemBlocks: plan.promptBlocks,
        messages: [{ role: "user", content: fixture.message }],
        responseLocale: "ko",
        onTextDelta: () => {},
        executeTool: async ({ name, input }) => {
          assert.equal(name, toolName);
          const result = await tool.execute!(input, {
            admin: admin as never,
            userId: "00000000-0000-4000-8000-000000000789",
            channel: "chat",
          });
          calls.push({ name, input, result });
          return result;
        },
        usageLabel: "eval:career-job-link-import",
      });
      const row = { id: fixture.id, calls, writes, response };
      results.push(row);
      save("results.json", results);
      const expected = gold.find((row: any) => row.id === fixture.id);
      assert.equal(writes.length, expected.writes, fixture.id);
      if (writes.length) {
        assert.equal(writes[0].p_role.title, expected.title);
        assert.equal(writes[0].p_role.companyName, expected.company);
        assert.equal(writes[0].p_role.description, fixture.body);
      }
      const recovery = calls.find((call) => call.result.ok === false)?.result;
      assert.ok(recovery?.modelOutput, "Must exercise retrieval recovery");
      const delivered = requests
        .filter((request) => request.caseId === fixture.id)
        .flatMap((request) => request.body.messages)
        .flatMap((message: any) =>
          Array.isArray(message.content) ? message.content : []
        )
        .filter((block: any) => block.type === "tool_result");
      assert.ok(
        delivered.some((block: any) => block.content === recovery.modelOutput),
        "Actual provider request must use dedicated text projection"
      );
      console.log(fixture.id, "writes:", writes.length, "reply:", response);
    }
  } finally {
    globalThis.fetch = originalFetch;
    save("requests.json", requests);
    save("results.json", results);
    save("manifest.json", {
      task: "career-job-link-import",
      datasetVersion: "v1",
      runId,
      model,
      provider: "anthropic",
      frozen,
      sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      dirtyDiffHash: hash(
        execFileSync("git", ["diff"], {
          encoding: "utf8",
          maxBuffer: 20_000_000,
        })
      ),
      runtimeSourceHashes: Object.fromEntries(
        [
          "src/lib/career/jobPostingReadResult.ts",
          "scripts/evalCareerJobLinkImport.ts",
        ].map((file) => [file, hash(readFileSync(file, "utf8"))])
      ),
      configuration:
        "production streaming adapter; fixed synthetic request time; per-request 90s; no provider fallback",
      rawArtifactPath: out,
      completedCases: results.length,
    });
    console.log("Run artifacts:", out);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
