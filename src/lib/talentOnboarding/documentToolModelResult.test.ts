import assert from "node:assert/strict";
import test from "node:test";
import { withCompactTalentToolModelResult } from "./toolModelResult";
import { formatToolResultText } from "@/lib/llm/promptText";
import { formatCareerDocumentLink, getCareerDocumentHref } from "@/lib/career/documentLinks";

const documentId = "445fd0c5-7d54-47db-8b80-493bc2f2be9e";
const link = formatCareerDocumentLink({ id: documentId, title: "김하늘 지원 자료.pdf" });
const fileGeneration = "Content is saved. This write did not generate or deliver a PDF; PDF generation happens when downloading or preparing an application attachment.";

function receipt(type: "resume" | "markdown") {
  return {
    ok: true,
    action: "copy",
    type,
    contentSaved: true,
    isDeleted: false,
    documentId,
    fileName: "김하늘 지원 자료.pdf",
    description: "데이터 플랫폼 지원용",
    revision: 1,
    isPrivate: true,
    kind: type === "resume" ? "resume" : "document",
    isPrimary: false,
    documentLink: link,
    href: getCareerDocumentHref(documentId),
    storage_path: "private-transport-only",
    uiPayload: { internal: "not-for-model" },
  };
}

function expectedWriteText(type: "resume" | "markdown") {
  return [
    "ok: 예",
    "action: copy",
    `type: ${type}`,
    "contentSaved: 예",
    "isDeleted: 아니요",
    `documentId: ${documentId}`,
    "fileName: 김하늘 지원 자료.pdf",
    "설명: 데이터 플랫폼 지원용",
    "revision: 1",
    "isPrivate: 예",
    `kind: ${type === "resume" ? "resume" : "document"}`,
    "isPrimary: 아니요",
    `documentLink: ${link}`,
    `fileGeneration: ${fileGeneration}`,
  ].join("\n");
}

test("unified document receipts preserve saved facts and separate content from PDF generation", () => {
  for (const type of ["resume", "markdown"] as const) {
    const raw = receipt(type);
    const projected = withCompactTalentToolModelResult("upsert_document", raw);
    assert.equal(formatToolResultText(projected), expectedWriteText(type));
    for (const key of Object.keys(raw)) assert.equal(projected[key], raw[key as keyof typeof raw]);
  }

  const metadataOnly = withCompactTalentToolModelResult("upsert_document", {
    ok: true,
    action: "update",
    type: "resume",
    contentSaved: false,
    isDeleted: true,
    document: {
      documentId, fileName: "김하늘 이력서.pdf", kind: "resume", revision: 4,
      isPublic: false, isPrimary: false, storage_path: "private-transport-only",
    },
  });
  assert.equal(formatToolResultText(metadataOnly), [
    "ok: 예", "action: update", "type: resume", "contentSaved: 아니요", "isDeleted: 예",
    "document: ", `  documentId: ${documentId}`, "  fileName: 김하늘 이력서.pdf",
    "  kind: resume", "  revision: 4", "  isPrimary: 아니요", "  isPublic: 아니요",
  ].join("\n"));
});

test("Career provider continuation receives the compact text for PDF and Markdown writes", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  const delivered: string[] = [];
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    requests++;
    assert.ok(requests <= 2, "only one write round and its continuation are expected");
    if (requests === 2) {
      for (const message of body.messages) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content) {
          if (block.type === "tool_result") delivered.push(block.content);
        }
      }
    }
    return Response.json({
      id: `message-${requests}`,
      content: requests === 1
        ? (["resume", "markdown"] as const).map(type => ({
          type: "tool_use", id: `write-${type}`, name: "upsert_document",
          input: { action: "copy", type },
        }))
        : [{ type: "text", text: "저장했습니다." }],
      stop_reason: requests === 1 ? "tool_use" : "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  };
  try {
    const { runCareerChatAssistant } = await import("@/lib/career/llm");
    await runCareerChatAssistant({
      executeTool: async ({ input }) => withCompactTalentToolModelResult("upsert_document", receipt(input.type as "resume" | "markdown")),
      messages: [{ role: "user", content: "이력서와 지원동기 문서를 각각 복사해줘." }],
      primaryModel: "claude-sonnet-4-6",
      responseLocale: "ko",
      systemBlocks: [{ key: "tool_policy", text: "Use the available document tool." }],
      tools: [{ type: "function", function: {
        name: "upsert_document", description: "Write an owned document.", parameters: { type: "object" },
      } }],
      usageLabel: "test:unified-document-provider-result",
    });
    assert.equal(requests, 2);
    assert.deepEqual(delivered, [expectedWriteText("resume"), expectedWriteText("markdown")]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  }
});
