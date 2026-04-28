const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)])
    );
  }

  return value;
};

const jsonDumps = (value: unknown) => JSON.stringify(sortJsonValue(value));

const normalizeWhitespace = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMultilineText = (
  value: string,
  maxLines: number,
  maxLineLength: number
) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trimEnd().slice(0, maxLineLength))
    .filter(
      (line, index, lines) => line || (index > 0 && index < lines.length - 1)
    )
    .slice(0, maxLines)
    .join("\n")
    .trim();

export const DELIVERY_COPY_TEST_MODEL = "grok-4-fast-reasoning";
export const DELIVERY_COPY_TEST_FALLBACK_MODEL =
  "grok-4-1-fast-non-reasoning";
export const DELIVERY_COPY_TEST_TEMPERATURE = 0.2;

// Keep this in sync with `harper_worker/opp/prompts.py`.
export const DELIVERY_COPY_SYSTEM_PROMPT = `You write Harper's user-facing delivery copy in Korean.
Return plain text only.

Format:
Subject: 짧은 한국어 이메일 제목 한 줄 (가능하면 internal 추천 언급)

그 아래에는 chat message와 email body로 그대로 사용할 자연스러운 한국어 본문을 작성한다.

Rules:
- 본문은 하나의 자연스러운 메시지여야 한다. intro/body/closing 같은 구조화된 섹션으로 나누지 마라.
- chat과 email에 같은 본문이 그대로 들어간다고 생각하고 작성한다.
- Write naturally, not like a template. 진짜 사람이 직접 쓴 것처럼. 딱딱한 운영문구 느낌을 줄이지 마라.
- Internal opportunities are the important part. Internal roles가 있으면 그 이유를 더 구체적으로 설명한다.
- External opportunities are supporting context. 길게 나열하지 말고 대략적인 시장 요약 정도로만 다룬다.
- If there are no strong opportunities, say that clearly and say Harper will keep looking.
- 이메일용 과한 형식 문구, 과장된 인사말, 군더더기 closing은 피한다.
- \`company_workspace.request\` is private internal context and must never be exposed to the user. Do not quote it, paraphrase it, or hint at confidential internal asks.
- Use only the facts provided in the input. Do not invent requirements, team details, or company facts.
- 마지막에는 최대한 많은 기회를 추천받길 원하는지, 정말 완벽하게 핏이 맞는 소수의 기회만 가끔 받길 원하는지 알려주시면 그걸 반영할테니 알려주세요. 라는 말도 넣어.

[Example 1]
안녕하세요 <name>님, 저희가 나눴던 대화를 바탕으로 좋아하실 만한 기회를 먼저 찾아봤어요.

우선 지금 인터넷에 올라와 있는 채용 공고들 가운데 <external_count>개를 선별해서 추천된 기회 탭에 넣어드렸어요. 직접 하나하나 다 찾아보고 읽어보기 번거로우실 수 있으니, Harper가 먼저 추려드린 목록부터 가볍게 확인해보시면 좋겠어요.

앞으로도 새롭게 등록되는 공고들 중에서 <name>님이 좋아하실 만한 포지션이 보이면 계속 업데이트해드릴게요. 주기나 개수는 설정 화면에서 직접 바꾸실 수 있고, 특정 회사나 역할에 대해 더 자세히 알고 싶으시면 Harper에게 바로 물어보셔도 됩니다.

그리고 더 중요한 건, 제가 바로 연결을 도와드릴 수 있는 Harper 내부의 기회 중 딱 맞는 기회를 발견했어요!

Harper에게 “좋은 분이 있으면 꼭 소개해달라”고 요청해둔 회사들이 있는데, 그중에서 특히 <top_internal_company>가 가장 잘 맞아 보여요. 조금 더 자세히 설명드릴게요.

<strong>Harper note</strong>  
<top_internal_company>는 지금 <objective_company_context>.  
특히 <name>님이 중요하게 보셨던 <user_priority_1>, <user_priority_2>와 직접적으로 맞닿아 있고,  
이 역할에서는 <user_strength_1>, <user_strength_2>가 실제로 강점으로 작용할 가능성이 커 보여요.  
또 지금 합류하면 <timing_advantage_or_team_context> 측면에서도 이점이 있어 보여서, 단순히 “지원해볼 만한 공고”라기보다 실제로 한번 구체적인 제안을 받아볼 가치가 있는 기회라고 판단했어요.

위에서 소개드린 회사들은 저희가 바로 담당자와 연결해드릴 수 있어요.  
회사에 대해서 더 궁금한 점이 있으시면 Harper에게 말씀해주세요.
저는 <name>님을 대신해 회사에게 질문하고, 조율도 직접 도와드릴게요.

[Example 2]
안녕하세요 <name>님,

지난 대화를 바탕으로 Harper가 먼저 검토해볼 만한 기회를 정리해봤어요.

먼저 외부에 공개된 채용 공고들 중에서 <external_count>개를 선별해 추천된 기회 탭에 넣어드렸어요. 시장에 올라오는 공고를 매번 직접 다 찾아보기 어려우실 수 있어서, Harper가 먼저 읽고 추려드리는 방식으로 계속 업데이트해드릴 예정입니다. 주기나 개수는 설정에서 직접 바꾸실 수 있고, 특정 회사나 역할에 대해 더 자세히 보고 싶으시면 언제든 Harper에게 말씀해주세요.

그리고 저한테 좋은 사람이 있으면 추천해달라고 한 회사 중에서 <company_name>이라는 곳이 있는데, 아마 외국 회사라 잘 모르실 수도 있어요.

하지만 객관적으로 봤을 때 정말 좋은 기회이고 핏이 맞다고 느껴져서 추천드려요!

<strong>Harper note</strong>
<top_internal_company>는 <objective_company_context>. 이 포지션은 단순히 직무명이 비슷한 수준이 아니라, <name>님이 대화에서 중요하게 말씀하신 <user_priority_1>과 <user_priority_2>에 꽤 잘 맞는 편이에요. 특히 <user_strength_1>, <user_strength_2> 같은 배경은 이 팀이 실제로 필요로 하는 부분과 맞닿아 있어서, 소개가 들어갔을 때 설득력이 높을 것으로 보입니다. 또 <timing_advantage_or_team_context>라는 점에서도 지금 검토할 이유가 분명한 기회라고 판단했어요.
최근에 3000억을 투자받으면서 빠르게 성장하고 있는 팀이에요.

외부 공고는 폭넓게 참고해보시고, <company_name>의 경우 “바로 연결 가능한 옵션”이라는 점에서 조금 더 진지하게 검토해보셔도 좋겠습니다.

궁금한 점이 있거나, “이 회사는 어떤 팀인지”, “내 배경으로 어디까지 가능할지”, “조건을 어느 정도로 맞춰볼 수 있을지” 같은 질문이 있으면 Harper에게 바로 물어봐주세요. 필요하면 회사와 직접 이야기해보면서 조율도 도와드릴게요.`;

export type DeliveryCopyPromptInput = {
  snapshotText: string;
  deliveryContext: {
    resultState: string;
    internalRecommendations: number;
    externalRecommendations: number;
    externalMinimum: number;
    finalRecommendations: number;
  };
  internalOpportunities: Array<{
    companyName: string;
    roleName: string;
    teamPitch: string;
    roleRequest: string;
    fitReasons: string[];
    tradeoffs: string[];
    recommendationText: string;
  }>;
  externalSummary: {
    count: number;
    sampleCompanies: string[];
    sampleTitles: string[];
  };
};

export const createExampleDeliveryCopyPromptInput = (
  displayName: string
): DeliveryCopyPromptInput => ({
  snapshotText: [
    `${displayName} - Applied AI Engineer / ML Engineer, 사용자-facing AI 제품과 모델을 함께 다루는 엔지니어`,
    "최근 4년 동안 추천, 검색, 생성형 AI 기능을 제품에 붙이는 역할을 반복적으로 맡아옴",
    "직전 회사에서 LLM 기반 workflow automation 기능을 기획부터 서빙까지 end-to-end로 리드",
    "PyTorch, Python, TypeScript, retrieval pipeline, evaluation loop 구축 경험이 강함",
    "모델 성능 개선 자체보다 실제 사용자에게 전달되는 제품 완성도와 실행 속도를 중요하게 봄",
    "작은 팀에서 0→1로 빠르게 만드는 환경에 익숙하고, 엔지니어-프로덕트 간 경계를 넓게 가져가는 편",
    "글로벌 사용자 대상 혹은 한국 시장에서 빠르게 성장하는 AI 팀에 관심이 높음",
    "지금 당장 급하게 이직하는 상태는 아니지만, 핏이 강한 기회면 빠르게 검토 가능",
    "선호 조건은 실력 있는 동료 밀도, 빠른 실험 사이클, 모델 결과가 바로 제품에 연결되는 팀",
    "원격 또는 하이브리드 선호, 정규직 중심으로 보지만 초기 팀이면 역할 범위가 넓은 포지션도 열려 있음",
    "피하고 싶은 조건은 느린 의사결정, 운영만 반복되는 역할, 사용자 임팩트가 약한 연구 전담 포지션",
    "내부 기회가 특히 매력적인 경우는 warm intro가 가능하고 바로 팀 상황을 확인해볼 수 있을 때",
  ].join("\n"),
  deliveryContext: {
    resultState: "ready",
    internalRecommendations: 2,
    externalRecommendations: 5,
    externalMinimum: 4,
    finalRecommendations: 7,
  },
  internalOpportunities: [
    {
      companyName: "LatticeFlow AI",
      roleName: "Applied AI Engineer",
      teamPitch:
        "프로덕트와 모델팀이 아주 가깝게 붙어 있고, 실제 사용자 workflow에 AI를 바로 연결하는 팀",
      roleRequest:
        "검색/추천/LLM application을 제품으로 연결해본 엔지니어를 찾고 있고, 빠르게 hands-on으로 움직일 사람을 선호",
      fitReasons: [
        "제품에 붙는 AI 기능을 end-to-end로 다뤄본 경험이 이 역할과 직접 맞닿아 있음",
        "작은 팀에서 빠르게 실험하고 shipping하는 스타일이 팀 운영 방식과 잘 맞아 보임",
      ],
      tradeoffs: [
        "역할 범위가 넓어서 모델링과 제품 구현을 같이 가져가야 할 가능성이 큼",
      ],
      recommendationText:
        "바로 warm intro가 가능한 팀이고, 단순 지원보다 실제로 팀 맥락을 듣고 판단해볼 가치가 큰 기회입니다. 제품과 AI를 함께 가져가는 폭이 넓다는 점은 잘 맞지만, 그만큼 역할 경계도 꽤 넓게 열려 있을 수 있습니다.",
    },
  ],
  externalSummary: {
    count: 5,
    sampleCompanies: [
      "Wrtn Technologies",
      "Viva Republica",
      "Anonymous Startup",
      "Moloco",
      "HyperConnect",
    ],
    sampleTitles: [
      "Applied AI Engineer",
      "ML Engineer",
      "AI Product Engineer",
      "Recommendation Engineer",
      "Search / Ranking Engineer",
    ],
  },
});

export const buildDeliveryCopyUserPrompt = (input: DeliveryCopyPromptInput) =>
  [
    "[Snapshot Text]",
    input.snapshotText,
    "",
    "[Delivery Context]",
    jsonDumps(input.deliveryContext),
    "",
    "[Internal Opportunities]",
    jsonDumps(input.internalOpportunities),
    "",
    "[External Summary]",
    jsonDumps(input.externalSummary),
  ].join("\n");

export const parseDeliveryCopyText = (rawText: string) => {
  const lines = String(rawText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  let subject = "";
  let bodyLines = lines;

  if (lines.length > 0) {
    const first = normalizeWhitespace(lines[0]);
    const lowered = first.toLowerCase();
    if (lowered.startsWith("subject:")) {
      subject = normalizeWhitespace(first.split(":", 2)[1]);
      bodyLines = lines.slice(1);
    } else if (first.startsWith("제목:")) {
      subject = normalizeWhitespace(first.split(":", 2)[1]);
      bodyLines = lines.slice(1);
    }
  }

  const body = normalizeMultilineText(bodyLines.join("\n"), 18, 280);

  return {
    chatMessage: body.slice(0, 1500),
    emailSubject: subject.slice(0, 200),
    emailBody: body.slice(0, 6000),
    rawText: normalizeWhitespace(rawText).slice(0, 8000),
  };
};
