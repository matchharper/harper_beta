// Synthetic model-only evaluation. Never accesses Supabase or real user records.
import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import {
  createSimulationSession,
  mutateSimulationSession,
  sessionMutationSchema,
} from "../../src/lib/career/simulation/session";
import { buildSimulationSessionPrompt } from "../../src/lib/career/simulation/sessionPrompt";
import { simulationSessionTool } from "../../src/lib/career/simulation/sessionTool";
import { buildCareerToolPolicyPrompt } from "../../src/lib/career/prompts/toolPolicyPrompt";
import { GPT_6_LUNA_MODEL } from "../../src/lib/llm/modelConfig";
async function main() {
  const client = new OpenAI();
  const results = [];
  const invitation = await client.chat.completions.create({
    model: GPT_6_LUNA_MODEL,
    messages: [
      { role: "system", content: buildCareerToolPolicyPrompt({ channel: "chat", preferredLocale: "ko", toolNames: ["simulate_application"] }) },
      { role: "user", content: "이 백엔드 엔지니어 포지션에 하퍼랑 지원 준비해볼래요." },
      { role: "assistant", content: null, tool_calls: [{ id: "fixture_start", type: "function", function: { name: "simulate_application", arguments: '{"roleId":"fixture"}' } }] },
      { role: "tool", tool_call_id: "fixture_start", content: JSON.stringify({ ok: true, role: "Example · Backend Engineer", nextStep: "The user can choose or upload a resume and start together using the displayed Apply with Harper card." }) },
    ],
    max_completion_tokens: 1500,
  });
  results.push({ request: "start card invitation", response: invitation.choices[0].message.content });
  for (const request of [
    "분석 끝났으면 뭐부터 하면 좋을까요?",
    "그냥 네가 이력서 문장을 수정해줘. 제가 API 서버 구현을 맡았던 것은 맞아요.",
  ]) {
    let session = createSimulationSession({
      roleRef: "role:fixture",
      roleName: "Example · Backend Engineer",
      documentId: "fixture-resume",
      documentName: "Sample CV",
    });
    session.analysisStatus = "completed";
    session.actions = [
      {
        id: "a1",
        category: "content",
        title: "API 프로젝트의 담당 범위 명확히 하기",
        target: "첫 프로젝트 불렛",
        proposal: "직접 담당한 API 구현과 성과를 추가",
        reason: "이 역할은 서비스 구현 경험을 요구한다",
        requirementIds: [],
        evidenceIds: [],
        needsConfirmation: true,
        questions: ["어떤 API를 직접 맡았나요?"],
        executionPrompt: "직접 담당한 API를 확인하고 문구를 제안",
        status: "needs_confirmation",
        resolution: "",
        evidenceMessageId: null,
      },
    ];
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "user", content: request },
    ];
    const calls: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await client.chat.completions.create({
        model: GPT_6_LUNA_MODEL,
        // This installed SDK predates the model's supported "none" value.
        reasoning_effort: "none" as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming["reasoning_effort"],
        messages: [
          {
            role: "system",
            content: buildSimulationSessionPrompt(session)
              .map((b) => b.text)
              .join("\n\n"),
          },
          ...messages,
        ],
        tools: [
          simulationSessionTool as OpenAI.Chat.Completions.ChatCompletionTool,
        ],
        max_completion_tokens: 4500,
      });
      const msg = response.choices[0].message;
      messages.push(msg);
      if (!msg.tool_calls?.length) {
        results.push({ request, response: msg.content, calls, session });
        break;
      }
      for (const call of msg.tool_calls) {
        if (call.type !== "function") throw new Error("Unexpected custom tool call");
        const input = JSON.parse(call.function.arguments);
        calls.push(input);
        try {
          session = mutateSimulationSession(
            session,
            sessionMutationSchema.parse(input),
            100 + i
          );
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ ok: true, sessionStatus: session.status }),
          });
        } catch (e) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ ok: false, error: String(e) }),
          });
        }
      }
    }
  }
  await writeFile(
    "/tmp/harper-simulation-session-eval.json",
    JSON.stringify(results, null, 2)
  );
  console.log(
    `Reviewed scenarios: ${results.length}; results: /tmp/harper-simulation-session-eval.json`
  );
}
void main();
