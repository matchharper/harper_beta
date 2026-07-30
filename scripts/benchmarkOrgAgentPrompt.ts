import dotenv from "dotenv";
import {
  buildOrgAgentSystemPrompt,
  buildOrgAgentUserPrompt,
} from "../src/lib/org/agent/prompts";
import {
  formatPromptSection,
  formatPromptTable,
  serializeOrgAgentToolResult,
} from "../src/lib/org/agent/promptFormat";
import type { OrgAgentPromptContext } from "../src/lib/org/agent/context";
import { ORG_AGENT_TOOLS } from "../src/lib/org/agent/tools";

dotenv.config({ path: ".env.local", quiet: true });

const MODEL = "claude-sonnet-5";
const BASELINE = {
  firstCompletionInputTokens: 9_422,
  getTalentsResultInputTokens: 4_913,
  promptChars: 13_668,
  toolResultChars: 8_870,
};

function roleId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function talentId(index: number) {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function recommendationId(index: number) {
  return `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function buildFixture() {
  const date = "2026-07-30";
  const timestamp = `${date}T10:23:45.123Z`;
  const roleRows = Array.from({ length: 12 }, (_, index) => [
    roleId(index),
    `${["Backend Engineer", "Product Designer", "Growth Marketer"][index % 3]} ${index + 1}`,
    "active",
    "서울",
    "hybrid",
    "full_time",
    date,
  ]);
  const requestRows = roleRows.map((row) => [
    row[0],
    "관련 경력 3년 이상, 빠른 실행력과 협업 능력을 선호",
  ]);
  const rolesText = [
    formatPromptSection(
      "role_core",
      formatPromptTable(
        [
          "role_id",
          "name",
          "status",
          "location",
          "mode",
          "employment",
          "updated",
        ],
        roleRows
      )
    ),
    formatPromptSection(
      "role_requests",
      formatPromptTable(["role_id", "request"], requestRows)
    ),
  ].join("\n");
  const recentRecommendationsText = formatPromptTable(
    [
      "talent_id",
      "name",
      "headline",
      "role_id",
      "role",
      "stage",
      "fit",
      "recommended",
    ],
    Array.from({ length: 20 }, (_, index) => [
      talentId(index),
      `후보자 ${index + 1}`,
      "B2B SaaS 제품을 만든 소프트웨어 엔지니어",
      roleId(index % 4),
      `Backend Engineer ${(index % 4) + 1}`,
      "connected",
      "관련 도메인 경험과 초기 팀 협업 경험이 강점",
      date,
    ])
  );
  const conversationText = formatPromptTable(
    ["speaker", "mentions", "message"],
    Array.from({ length: 12 }, (_, index) => [
      index % 2 ? "assistant" : "user",
      "-",
      index % 2
        ? "확인했습니다. 관련 후보자와 포지션 기준을 살펴보겠습니다."
        : "백엔드 포지션에서 B2B SaaS 경험이 있는 사람을 우선해서 봐줘.",
    ])
  );
  const companyText = formatPromptTable(
    ["field", "value"],
    [
      ["name", "Harper Test"],
      ["description", "AI 기반 채용 운영 플랫폼을 만드는 회사입니다."],
      [
        "pitch",
        "좋은 팀이 좋은 사람을 더 빠르고 정확하게 만날 수 있게 합니다.",
      ],
      [
        "recruiting_request",
        "초기 팀 경험, 높은 실행력, 명확한 커뮤니케이션을 전사 공통 기준으로 봅니다.",
      ],
    ]
  );
  const context = {
    companyText,
    completeRoleRequestIds: roleRows.map((row) => String(row[0])),
    contextNotesText: "-",
    conversationText,
    recentRecommendationsText,
    roles: roleRows.map((row) => ({ roleId: String(row[0]) })),
    rolesText,
    summariesText:
      "백엔드 포지션은 B2B SaaS 경험과 초기 팀 협업을 중요하게 본다.\n---\nProduct Designer는 모바일 B2C 경험을 우선한다.",
    workspace: {
      companyDescription: "AI 기반 채용 운영 플랫폼을 만드는 회사입니다.",
      companyName: "Harper Test",
      logoUrl: null,
      pitch: "좋은 팀이 좋은 사람을 더 빠르고 정확하게 만날 수 있게 합니다.",
      request:
        "초기 팀 경험, 높은 실행력, 명확한 커뮤니케이션을 전사 공통 기준으로 봅니다.",
      updatedAt: timestamp,
      workspaceId: "workspace-id",
    },
  };
  const searchResult = {
    hasMore: false,
    items: Array.from({ length: 20 }, (_, index) => ({
      candidate: {
        email: `candidate${index}@example.com`,
        headline: "B2B SaaS 제품을 만든 소프트웨어 엔지니어",
        name: `후보자 ${index + 1}`,
        talentId: talentId(index),
      },
      fitSummary: "관련 도메인 경험과 초기 팀 협업 경험이 강점",
      recommendationId: recommendationId(index),
      recommendedAt: timestamp,
      role: {
        name: `Backend Engineer ${(index % 4) + 1}`,
        roleId: roleId(index % 4),
      },
      stage: "connected",
      updatedAt: timestamp,
    })),
    limit: 20,
    offset: 0,
  };
  return { context, searchResult };
}

async function countTokens(body: Record<string, unknown>) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required in .env.local");
  const response = await fetch(
    "https://api.anthropic.com/v1/messages/count_tokens",
    {
      body: JSON.stringify({ model: MODEL, ...body }),
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      method: "POST",
    }
  );
  const result = (await response.json()) as {
    error?: unknown;
    input_tokens?: number;
  };
  if (!response.ok || typeof result.input_tokens !== "number") {
    throw new Error(`Token count failed (${response.status})`);
  }
  return result.input_tokens;
}

async function main() {
  const fixture = buildFixture();
  const system = buildOrgAgentSystemPrompt();
  const user = buildOrgAgentUserPrompt({
    context: fixture.context as unknown as OrgAgentPromptContext,
    mentions: [],
    userMessage: "백엔드 포지션 최근 추천 후보 중 누구를 먼저 봐야 해?",
  });
  const tools = ORG_AGENT_TOOLS.map((item) => ({
    description: item.function.description,
    input_schema: item.function.parameters,
    name: item.function.name,
  }));
  const rawToolResult = JSON.stringify(fixture.searchResult);
  const compactToolResult = serializeOrgAgentToolResult(
    "get_talents",
    fixture.searchResult
  );
  const [firstCompletionInputTokens, compactToolResultInputTokens] =
    await Promise.all([
      countTokens({
        messages: [{ content: user, role: "user" }],
        system,
        tools,
      }),
      countTokens({
        messages: [{ content: compactToolResult, role: "user" }],
      }),
    ]);

  console.log(
    JSON.stringify(
      {
        baseline: BASELINE,
        current: {
          firstCompletionInputTokens,
          promptChars: system.length + user.length,
          systemChars: system.length,
          toolResultChars: compactToolResult.length,
          toolResultInputTokens: compactToolResultInputTokens,
          toolSchemaChars: JSON.stringify(tools).length,
          userPromptChars: user.length,
        },
        reductionPercent: {
          firstCompletionInputTokens: Number(
            (
              (1 -
                firstCompletionInputTokens /
                  BASELINE.firstCompletionInputTokens) *
              100
            ).toFixed(1)
          ),
          promptChars: Number(
            (
              (1 - (system.length + user.length) / BASELINE.promptChars) *
              100
            ).toFixed(1)
          ),
          toolResultChars: Number(
            (
              (1 - compactToolResult.length / BASELINE.toolResultChars) *
              100
            ).toFixed(1)
          ),
          toolResultInputTokens: Number(
            (
              (1 -
                compactToolResultInputTokens /
                  BASELINE.getTalentsResultInputTokens) *
              100
            ).toFixed(1)
          ),
        },
        rawToolResultChars: rawToolResult.length,
      },
      null,
      2
    )
  );
}

void main();
