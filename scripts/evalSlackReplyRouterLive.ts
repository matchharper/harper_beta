import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

type EvalMessage = {
  content: string;
  role: "assistant" | "user";
  slackUserId?: string;
};

type EvalCase = {
  expected: Array<"respond" | "ignore" | "uncertain">;
  messages: EvalMessage[];
  name: string;
};

const cases: EvalCase[] = [
  {
    name: "Harper 답변에 후속 정보 요청",
    expected: ["respond"],
    messages: [
      {
        role: "assistant",
        content: "이번 주 신규 후보자 세 명을 요약했습니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "두 번째 후보의 엔터프라이즈 세일즈 경력을 더 보여줘.",
      },
    ],
  },
  {
    name: "사람끼리 업무를 인계",
    expected: ["ignore"],
    messages: [
      {
        role: "assistant",
        content: "김샘플 님은 다음 주부터 인터뷰가 가능합니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "민수님, 정확한 가능 시간 확인해줄래요?",
      },
      {
        role: "user",
        slackUserId: "U2",
        content: "네, 제가 오늘 후보자에게 연락할게요.",
      },
    ],
  },
  {
    name: "Harper 질문에 답변",
    expected: ["respond"],
    messages: [
      {
        role: "assistant",
        content: "어느 포지션의 기준으로 후보를 비교할까요?",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "백엔드 엔지니어 포지션 기준으로 봐줘.",
      },
    ],
  },
  {
    name: "단순 감사",
    expected: ["ignore"],
    messages: [
      {
        role: "assistant",
        content: "요청한 인터뷰 질문 다섯 개를 정리했습니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "오케이, 고마워요!",
      },
    ],
  },
  {
    name: "다른 사람에게 의견 질문",
    expected: ["ignore"],
    messages: [
      {
        role: "assistant",
        content: "두 후보의 장단점을 비교했습니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content:
          "저는 첫 번째 후보가 더 좋아 보여요. 지수님은 어떻게 생각하세요?",
      },
    ],
  },
  {
    name: "후속 액션 요청",
    expected: ["respond"],
    messages: [
      {
        role: "assistant",
        content: "현재 이 후보는 서류 검토 단계입니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "그럼 이 후보를 인터뷰 단계로 옮겨줘.",
      },
    ],
  },
  {
    name: "수신자가 모호한 혼잣말",
    expected: ["uncertain", "ignore"],
    messages: [
      {
        role: "assistant",
        content: "공개된 정보만으로는 리더십 경험을 확인하기 어렵습니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "흠, 이건 좀 애매한데.",
      },
    ],
  },
  {
    name: "사람들 대화 중 Harper 재호출",
    expected: ["respond"],
    messages: [
      {
        role: "assistant",
        content: "최근 보상 정보는 아직 등록되지 않았습니다.",
      },
      {
        role: "user",
        slackUserId: "U1",
        content: "이건 채용 담당자에게 물어봐야겠네요.",
      },
      {
        role: "user",
        slackUserId: "U2",
        content:
          "그러게요. Harper가 알고 있는 이전 연봉 정보라도 찾아줄 수 있을까요?",
      },
    ],
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }
  const { decideHarperSlackThreadReply } =
    await import("../src/lib/org/slackReplyRouter");
  let passed = 0;
  for (const evalCase of cases) {
    const decision = await decideHarperSlackThreadReply(evalCase.messages, {
      logUsage: false,
    });
    const ok = evalCase.expected.includes(decision);
    if (ok) passed += 1;
    console.log(`${ok ? "PASS" : "FAIL"} | ${evalCase.name} | ${decision}`);
  }
  console.log(`\n${passed}/${cases.length} passed`);
  if (passed !== cases.length) process.exitCode = 1;
}

void main();
