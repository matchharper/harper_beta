import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const SOURCE_WORKSPACE_ID = "720254d7-aeb7-4709-a56f-7b822f89eac5";
const SOURCE_ROLE_ID = "3bb22f4a-1c13-4bf1-be07-6034605d6840";
const TEST_FIXTURE = "role-hiring-brief-calibration-terra-eval-v1";

type Profile = {
  content: string;
  label: string;
  url: string | null;
};

type EvalCase = {
  id: string;
  profiles: Profile[];
  userMessage: string;
};

type EvalToolCall = {
  function: { arguments: string; name: string };
  id: string;
  type: "function";
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assistantText(response: unknown) {
  const root = record(response);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = record(record(choices[0]).message);
  if (typeof message.content === "string") return text(message.content);
  if (!Array.isArray(message.content)) return "";
  return text(
    message.content
      .map((item) => {
        const part = record(item);
        return typeof part.text === "string"
          ? part.text
          : typeof part.content === "string"
            ? part.content
            : "";
      })
      .join("")
  );
}

function parseToolCalls(message: Record<string, unknown>): EvalToolCall[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap((raw, index) => {
    const item = record(raw);
    const fn = record(item.function);
    const name = text(fn.name);
    if (!name) return [];
    return [
      {
        function: {
          arguments:
            typeof fn.arguments === "string"
              ? fn.arguments
              : JSON.stringify(fn.arguments ?? {}),
          name,
        },
        id: text(item.id) || `calibration_eval_tool_${index}`,
        type: "function" as const,
      },
    ];
  });
}

const profiles = {
  conventionalKorea: {
    label: "Min Park — platform engineering leader",
    url: "https://www.linkedin.com/in/eval-min-park",
    content: `서울과학고와 KAIST 전산학부를 거쳐 NAVER 검색 인프라 핵심 팀에서 엔지니어로 시작했다. LINE의 대규모 메시징 플랫폼 팀으로 옮긴 뒤 4년 안에 Staff Engineer로 승진했다. 수천만 사용자의 실시간 트래픽을 처리하는 핵심 경로를 재설계했고, 장애율과 인프라 비용을 함께 낮춘 결과가 조직 문서와 발표로 확인된다. 이후 12명 규모 AI 제품팀의 기술 리드를 맡아 모델 서빙과 제품 백엔드를 함께 책임졌다.`,
  },
  conventionalGlobal: {
    label: "Alex Chen — core AI systems engineer",
    url: "https://www.linkedin.com/in/eval-alex-chen",
    content: `Stanford Computer Science를 졸업하고 Stripe의 core payments infrastructure에서 고신뢰 분산 시스템을 담당했다. OpenAI의 모델 서빙 핵심 팀으로 선발되어 빠르게 Senior 단계로 성장했고, 여러 제품이 의존하는 inference reliability 영역을 끝까지 소유했다. 복수의 팀이 쓰는 시스템을 설계하고 운영 지표를 실질적으로 개선한 기록이 있다.`,
  },
  selectiveResearch: {
    label: "Jiyoon Lee — research engineering lead",
    url: "https://www.linkedin.com/in/eval-jiyoon-lee",
    content: `서울과학고, 서울대학교 컴퓨터공학부, CMU 박사를 거쳤다. Google DeepMind의 core evaluation 팀에서 연구 결과를 실제 제품 의사결정에 연결하는 평가 인프라를 만들었고, 3개 연구 그룹이 공통으로 쓰는 시스템의 책임자가 되었다. 논문 수보다 까다로운 팀에 반복 선발된 점, 빠른 책임 범위 확대, 조직 공통 기반을 만든 기여가 두드러진다.`,
  },
  unconventionalFounder: {
    label: "Dana Kim — unconventional founder",
    url: "https://dana.example/about",
    content: `비수도권 대학 졸업 후 유명 대기업 경력 없이 개발자 도구 회사를 공동창업했다. 첫 제품을 직접 설계하고 6년 동안 글로벌 매출 2,000만 달러, 유료 고객 2,400곳, 55명 조직으로 성장시킨 뒤 전략적 인수를 이끌었다. 오픈소스 핵심 프로젝트는 35,000 stars와 600명 이상의 외부 기여자를 확보했다. 기술·채용·고객 확보를 단계별로 다른 리더에게 위임하며 조직 수준도 높였다.`,
  },
  exceptionalIc: {
    label: "Robin Seo — independent exceptional IC",
    url: "https://github.com/eval-robin-seo",
    content: `학교와 회사의 유명도는 높지 않지만, 혼자 시작한 분산 워크플로 엔진이 주요 클라우드 사업자 세 곳의 공식 예제와 400개 기업의 운영 환경에 채택됐다. 공개 벤치마크에서 기존 대안 대비 처리량을 크게 높였고 핵심 설계가 독립적인 기술 검토로 검증됐다. 이후 작은 회사에서 Principal Engineer로 승진해 여러 팀의 아키텍처 결정을 책임졌다.`,
  },
  logoWithoutDepth: {
    label: "Taylor Lee — prestigious affiliations, unclear contribution",
    url: "https://www.linkedin.com/in/eval-taylor-lee",
    content: `MIT 학부를 졸업하고 Google과 Meta에서 총 4년 근무했다. 각 회사에서 여러 팀을 짧게 거쳤으며 담당 범위, 승진, 핵심 팀 선발, 구체적인 제품·시스템 성과는 공개 프로필에서 확인되지 않는다. 현재는 초기 스타트업의 소프트웨어 엔지니어다.`,
  },
  roleFitOnly: {
    label: "Chris Han — direct role fit, ordinary quality evidence",
    url: "https://www.linkedin.com/in/eval-chris-han",
    content: `7년 동안 중소 SaaS 회사에서 풀스택 개발을 했고 최근 2년은 LLM API를 이용한 고객지원 Agent를 만들었다. React, TypeScript, Python, RAG, prompt evaluation 경험이 있고 작은 팀의 0-to-1 제품 출시를 세 차례 경험했다. 다만 시스템 난이도, 사용자 규모, 선발 환경, 책임의 확대, 독립 검증된 성과에 대한 정보는 제한적이다.`,
  },
  scaledOperator: {
    label: "Morgan Yoo — scaled product operator",
    url: "https://engineering.example/team/eval-morgan-yoo",
    content: `학력은 일반적이지만 Coupang의 물류 최적화 핵심 팀에서 3년간 빠르게 승진했다. 이후 Toss에서 여러 제품팀이 공통으로 쓰는 리스크 플랫폼을 책임졌고, 규제 환경에서 대규모 거래를 안정적으로 처리했다. 직함보다 선택된 팀의 난이도, 책임 범위 확대, 측정 가능한 운영 성과가 강하다.`,
  },
  resumeAttachment: {
    label: "candidate-reference-resume.pdf",
    url: null,
    content: `Resume: 이수현. 부산대학교 컴퓨터공학. 2017-2021 우아한형제들 주문 플랫폼 엔지니어, 2021-현재 당근마켓 지역 비즈니스 플랫폼. Senior에서 Staff로 승진. 피크 트래픽 핵심 경로 재설계, 장애 예산 체계 도입, 세 팀의 공통 플랫폼 책임. 사내 핵심 기술 리더 그룹으로 선발. 사용자는 이 사람이 현재 팀에서 가장 신뢰하는 엔지니어 중 한 명이며, 회사 이름 자체보다 까다로운 핵심 문제를 반복해서 맡고 책임 범위가 커진 점을 높게 평가한다고 설명했다.`,
  },
} satisfies Record<string, Profile>;

const cases: EvalCase[] = [
  {
    id: "01_one_top_tier_explicit",
    profiles: [profiles.conventionalKorea],
    userMessage:
      "이 역할은 이런 사람을 찾아줘. 서울과학고·KAIST를 거쳐 NAVER와 LINE 핵심 팀에서 계속 선발되고 빠르게 성장한 정도의 talent quality가 특히 가산점이야. Agent 경험 여부보다 회사가 만족할 전체 인재 수준을 맞추는 참고 예시로 봐줘.",
  },
  {
    id: "02_one_unconventional_equivalent",
    profiles: [profiles.unconventionalFounder],
    userMessage:
      "이 역할의 이상적인 참고 인물이야. 학교나 대기업 간판은 없지만 이 정도로 희소하고 검증된 창업 성과와 책임 확장이면 우리가 원하는 급이라고 봐. 한 사람의 이력을 필수조건처럼 복사하지 말고 회사의 quality bar를 잡아줘.",
  },
  {
    id: "03_one_ambiguous_logo_profile",
    profiles: [profiles.logoWithoutDepth],
    userMessage:
      "이런 사람을 참고해서 이 역할에 맞는 사람을 찾아줘. 아직 이 사람의 어떤 점을 가장 높게 보는지는 더 설명하지 않았어.",
  },
  {
    id: "04_two_shared_selective_path",
    profiles: [profiles.conventionalKorea, profiles.conventionalGlobal],
    userMessage:
      "둘 다 현재 팀이 이 역할에서 바로 인터뷰하고 싶어 할 이상적인 급의 예시야. 공통적으로 Top-tier 학교와 회사의 어려운 핵심 팀에 반복 선발됐고 그 안에서도 빠르게 성장하고 실질 기여를 했다는 점을 높게 봐.",
  },
  {
    id: "05_two_different_equivalent_paths",
    profiles: [profiles.conventionalKorea, profiles.unconventionalFounder],
    userMessage:
      "둘은 경로가 다르지만 둘 다 우리가 만족할 quality bar야. 첫 사람은 Top-tier 학교·회사·핵심 팀의 반복 선발과 성장, 두 번째는 그런 간판을 대체할 만큼 희소하고 검증된 창업 성과가 이유야. 공통 이력만 억지로 뽑지 말고 동급 판단 규칙을 적어줘.",
  },
  {
    id: "06_three_all_top_tier",
    profiles: [
      profiles.conventionalKorea,
      profiles.conventionalGlobal,
      profiles.selectiveResearch,
    ],
    userMessage:
      "세 명 모두 현재 팀의 대표적인 이상적 프로필이야. Top-tier 학교와 회사 혹은 연구 조직의 실제로 선발적인 핵심 트랙을 반복해서 통과했고, 그 안에서 책임과 기여가 빠르게 커진 것이 회사 인재 수준과 맞는 이유야. 이것이 어느 정도 필수인지와 동급 대체 증거는 아직 열려 있어.",
  },
  {
    id: "07_three_logo_counterexample",
    profiles: [
      profiles.conventionalKorea,
      profiles.conventionalGlobal,
      profiles.logoWithoutDepth,
    ],
    userMessage:
      "앞의 두 사람은 이상적이지만 세 번째는 학교와 회사 이름만 비슷할 뿐 우리가 원하는 급이라고 판단하기 어렵다는 반례야. 간판만 whitelist로 만들지 말고 실제 팀 선발성, 성장, 기여 깊이가 무엇을 바꾸는지 Hiring Brief에 반영해줘.",
  },
  {
    id: "08_three_pedigree_not_important",
    profiles: [
      profiles.unconventionalFounder,
      profiles.exceptionalIc,
      profiles.scaledOperator,
    ],
    userMessage:
      "이 세 명이 우리가 원하는 급의 서로 다른 예시야. 이 역할에서는 학교나 회사의 브랜드 자체는 중요하지 않아. 희소하고 독립적으로 검증된 결과, 어려운 환경에서의 반복 성과, 책임 범위가 커진 궤적이 있다면 동급으로 본다는 기준을 명시해줘.",
  },
  {
    id: "09_five_diverse_equivalents",
    profiles: [
      profiles.conventionalKorea,
      profiles.conventionalGlobal,
      profiles.unconventionalFounder,
      profiles.exceptionalIc,
      profiles.scaledOperator,
    ],
    userMessage:
      "다섯 명 모두 인터뷰하고 싶은 caliber인데 경로는 다양해. Top-tier 기관의 핵심 팀에서 반복 검증된 경로도 있고, 그 간판 없이도 압도적인 창업·오픈소스·대규모 운영 성과로 동급을 증명한 경로도 있어. role fit 키워드를 공통분모로 삼지 말고 회사의 talent quality 판단 경계를 만들어줘.",
  },
  {
    id: "10_five_selectivity_with_depth",
    profiles: [
      profiles.conventionalKorea,
      profiles.conventionalGlobal,
      profiles.selectiveResearch,
      profiles.scaledOperator,
      profiles.logoWithoutDepth,
    ],
    userMessage:
      "처음 네 명은 이 역할의 강한 참고 인물이고 마지막 사람은 반례야. 우리 회사는 Top-tier 학교·회사·연구조직의 반복 선발을 분명 강한 신호로 보지만 이름만 거친 것은 부족해. 실제 핵심 팀, 빠른 성장, 어려운 문제의 소유권, 검증 가능한 기여까지 있어야 한다는 수준을 적어줘.",
  },
  {
    id: "11_role_fit_decoy_vs_caliber",
    profiles: [profiles.roleFitOnly, profiles.conventionalKorea],
    userMessage:
      "첫 사람은 Agent와 0-to-1 경험이 직접 맞지만 회사가 원하는 전체 talent quality에는 아직 못 미칠 수 있어. 두 번째는 Agent 키워드가 덜 직접적이어도 우리가 기대하는 급에 가깝다. 역할 경험 fit과 회사 caliber를 분리해 실제 추천 경계를 수정해줘.",
  },
  {
    id: "12_resume_attachment_current_teammate",
    profiles: [profiles.resumeAttachment],
    userMessage:
      "첨부한 이력서는 현재 팀의 대표적인 이상적 프로필 예시야. 특정 회사 이름을 복제하려는 게 아니라 어려운 핵심 문제를 반복해서 맡고 Staff까지 책임 범위가 커졌으며 여러 팀이 의존하는 결과를 만든 정도를 가산점으로 보고 싶어.",
  },
];

async function loadPausedHarperRole() {
  const supabaseUrl = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase read credentials are required for this eval");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [
    { data: role, error: roleError },
    { data: internal, error: internalError },
  ] = await Promise.all([
    admin
      .from("company_roles")
      .select("role_id, company_workspace_id, name, description, status")
      .eq("company_workspace_id", SOURCE_WORKSPACE_ID)
      .eq("role_id", SOURCE_ROLE_ID)
      .single(),
    admin
      .from("company_internal_roles")
      .select("role_id, request")
      .eq("role_id", SOURCE_ROLE_ID)
      .single(),
  ]);
  if (roleError) throw roleError;
  if (internalError) throw internalError;
  if (text(role.status) !== "paused") {
    throw new Error(`Eval source Role must remain paused; got ${role.status}`);
  }
  return {
    description: text(role.description),
    information: { testFixture: TEST_FIXTURE, testOnly: true },
    name: text(role.name),
    request: text(internal.request),
    roleId: text(role.role_id),
    status: "paused" as const,
    workspaceId: text(role.company_workspace_id),
  };
}

async function main() {
  const [llm, modelConfig, prompt] = await Promise.all([
    import("../src/lib/llm/llm"),
    import("../src/lib/org/agent/modelConfig"),
    import("../src/lib/org/agent/roleCalibrationPrompt"),
  ]);
  const sourceRole = await loadPausedHarperRole();
  const requestedIds = new Set(
    text(process.env.CALIBRATION_EVAL_CASES)
      .split(",")
      .map(text)
      .filter(Boolean)
  );
  const selectedCases =
    requestedIds.size === 0
      ? cases
      : cases.filter((item) => requestedIds.has(item.id));
  if (selectedCases.length === 0) throw new Error("No eval cases selected");
  const errors: string[] = [];
  const successes: string[] = [];

  console.log(
    JSON.stringify({
      databaseWrites: 0,
      fixture: sourceRole.information,
      sourceRole: {
        name: sourceRole.name,
        roleId: sourceRole.roleId,
        status: sourceRole.status,
        workspaceId: sourceRole.workspaceId,
      },
      testCount: selectedCases.length,
    })
  );

  const concurrency = Math.max(
    1,
    Math.min(3, Number(process.env.CALIBRATION_EVAL_CONCURRENCY ?? 1) || 1)
  );
  for (let offset = 0; offset < selectedCases.length; offset += concurrency) {
    await Promise.all(
      selectedCases
        .slice(offset, offset + concurrency)
        .map(async (item, slot) => {
          const index = offset + slot;
          // A fresh clone is the whole test fixture. Nothing in this script writes to
          // Supabase; discarding this object resets every test to the same baseline.
          let fixture = structuredClone(sourceRole);
          let references = item.profiles
            .filter((profile) => !profile.url)
            .map((profile) => ({
            content: profile.content,
            label: profile.label,
            sourceKind: "attachment" as const,
            truncated: false,
            url: null,
          }));
          const expectedUrls = item.profiles.flatMap((profile) =>
            profile.url ? [profile.url] : []
          );
          const profileByUrl = new Map(
            item.profiles.flatMap((profile) =>
              profile.url ? [[profile.url, profile] as const] : []
            )
          );
          console.log(
            `START ${index + 1}/${selectedCases.length} ${item.id} references=${references.length} reset=baseline`
          );
          try {
            const messages: any[] = [
              {
                content: prompt.buildRoleCalibrationSystemPrompt(),
                role: "system" as const,
              },
              {
                content: prompt.buildRoleCalibrationUserPrompt({
                  companyContext:
                    "Harper internal workspace. A small, high-talent-density team building an AI career agent and matching product.",
                  companySideContext: [
                    "This is an isolated read-only calibration evaluation.",
                    item.userMessage,
                    expectedUrls.length > 0
                      ? `User-supplied professional sources:\n${expectedUrls.join("\n")}`
                      : "The current attachment is already included in the supplied sources.",
                  ].join("\n\n"),
                  currentHiringBrief: fixture.request,
                  otherRoleCalibrationContext: "",
                  references,
                  roleDescription: fixture.description,
                  roleName: fixture.name,
                  userMessage: [item.userMessage, ...expectedUrls].join("\n"),
                }),
                role: "user" as const,
              },
            ];
            const openedBatches: string[][] = [];
            let draft: ReturnType<typeof prompt.parseRoleCalibrationDraft> | null =
              null;
            let completionModel = "";
            for (let toolLoop = 0; toolLoop < 4; toolLoop += 1) {
              const completion = await llm.createChatCompletionWithFallback({
                buildRequest: (activeModel) => ({
                  ...(llm.usesMaxCompletionTokensForModel(activeModel)
                    ? { max_completion_tokens: 24_000 }
                    : { max_tokens: 24_000 }),
                  messages,
                  response_format: {
                    json_schema: {
                      name: "role_hiring_brief_calibration_eval",
                      schema: prompt.ROLE_CALIBRATION_JSON_SCHEMA,
                      strict: true,
                    },
                    type: "json_schema" as const,
                  },
                  tool_choice: "auto" as const,
                  tools: [
                    prompt.ROLE_CALIBRATION_OPEN_URL_TOOL_DEFINITION,
                    prompt.ROLE_CALIBRATION_READ_TALENT_TOOL_DEFINITION,
                  ],
                }),
                debugLabel: `org/agent:role-calibration-terra-eval:${item.id}:${toolLoop + 1}`,
                model: modelConfig.ORG_AGENT_TERRA_MODEL,
                openAIResponses: { reasoningEffort: "max" },
                signal: AbortSignal.timeout(300_000),
              });
              completionModel = completion.model;
              if (completion.model !== modelConfig.ORG_AGENT_TERRA_MODEL) {
                throw new Error(
                  `Expected ${modelConfig.ORG_AGENT_TERRA_MODEL}; got ${completion.model}`
                );
              }
              const root = record(completion.response);
              const choices = Array.isArray(root.choices) ? root.choices : [];
              const responseMessage = record(record(choices[0]).message);
              const calls = parseToolCalls(responseMessage);
              if (calls.length === 0) {
                draft = prompt.parseRoleCalibrationDraft(
                  assistantText(completion.response)
                );
                break;
              }
              messages.push({
                _responses_output: Array.isArray(
                  responseMessage._responses_output
                )
                  ? responseMessage._responses_output
                  : undefined,
                content: text(responseMessage.content),
                role: "assistant",
                tool_calls: calls,
              });
              for (const call of calls) {
                const input = record(
                  JSON.parse(call.function.arguments || "{}")
                );
                if (call.function.name !== "open_url") {
                  throw new Error(
                    `Unexpected eval tool: ${call.function.name}`
                  );
                }
                const urls = Array.isArray(input.urls)
                  ? input.urls.map(text).filter(Boolean)
                  : [];
                openedBatches.push(urls);
                messages.push({
                  content: JSON.stringify({
                    failed: urls.flatMap((url) =>
                      profileByUrl.has(url)
                        ? []
                        : [{ error: "unreadable", url }]
                    ),
                    pages: urls.flatMap((url) => {
                      const profile = profileByUrl.get(url);
                      return profile
                        ? [
                            {
                              content: profile.content,
                              label: profile.label,
                              sourceKind: "url",
                              truncated: false,
                              url,
                            },
                          ]
                        : [];
                    }),
                  }),
                  role: "tool",
                  tool_call_id: call.id,
                });
              }
            }
            if (!draft) throw new Error("Agentic eval returned no final JSON");
            const openedUrls = new Set(openedBatches.flat());
            if (expectedUrls.some((url) => !openedUrls.has(url))) {
              throw new Error("Terra did not read every supplied URL");
            }
            if (expectedUrls.length > 1 && !openedBatches.some((batch) => batch.length > 1)) {
              throw new Error("Terra did not batch multiple supplied URLs");
            }
            console.log(
              JSON.stringify({
                followUpQuestion: draft.followUpQuestion,
                hiringBrief: draft.hiringBrief,
                id: item.id,
                model: completionModel,
                openedBatches,
                reasoningEffort: "max",
                referenceCount: references.length + expectedUrls.length,
                shouldUpdate: draft.shouldUpdate,
                summary: draft.summary,
                userReply: draft.userReply,
              })
            );
            successes.push(item.id);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            errors.push(`${item.id}: ${message}`);
            console.log(JSON.stringify({ error: message, id: item.id }));
          } finally {
            fixture.request = "";
            fixture.description = "";
            references = [];
            console.log(
              `RESET ${item.id} persisted=false databaseWrites=0 inMemoryCleared=true`
            );
          }
        })
    );
  }
  console.log(
    JSON.stringify({
      completed: successes.length,
      databaseWrites: 0,
      errors,
      requested: selectedCases.length,
      resetCount: selectedCases.length,
    })
  );
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
