import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const channel = {
  aliases: ["#채용"],
  id: "channel:C1",
  kind: "channel" as const,
  label: "채용",
};
const assignee = {
  aliases: [],
  id: "assignee:U1",
  kind: "assignee" as const,
  label: "김민수",
};

// Harper messages from real role creation chats, with names masked.
const askedForReplyWord =
  "탐색을 시작하려면 역할을 등록해야 합니다. 알림은 `#채용` 채널과 현재 작성자 김민수님으로 설정해 둘게요. “등록 진행”이라고 답하면 최종 확인을 열겠습니다.";
const askedTwoQuestions =
  "등록 전 두 가지만 정하면 됩니다.\n\n• 근무지는 어디인가요? 현재 근무 형태는 오피스 출근으로 설정돼 있습니다.\n• 알림을 `#채용` 채널과 김민수님에게 연결해도 되는지 확인해 주세요.";
const askedSettings =
  "등록 전에 알림 설정만 확인해 주세요.\n\n*알림 설정*\n• 채널: `#채용`\n• 담당자: 김민수\n\n이 설정으로 진행해도 될까요?";
const askedSettingsAndRegistration =
  "최종 등록을 위해 알림 채널과 담당자를 아래와 같이 설정하려고 해요.\n\n- **Slack 채널**: #채용\n- **담당자**: 김민수\n\n이 설정으로 확정하고 최종 등록을 진행할까요?";
const askedAssigneeOption =
  "* **Slack 채널**: `#채용` 연결 완료\n\n담당자로 지정할 수 있는 팀원은 김민수 님과 이지은 님이에요.\n1. 다른 팀원을 먼저 초대한 뒤 담당자로 지정\n2. 현재 팀원 중 한 분을 우선 담당자로 선택\n\n어떤 방식으로 진행할지 말씀해 주세요.";

const cases = [
  {
    name: "Harper가 안내한 답 그대로",
    expected: true,
    previousAssistantMessage: askedForReplyWord,
    targets: [channel, assignee],
    userMessage: "등록 진행",
  },
  {
    name: "두 질문에 한 번에 답하며 ㅇㅇ",
    expected: true,
    previousAssistantMessage: askedTwoQuestions,
    targets: [channel, assignee],
    userMessage: "ㅋㅋㅋ\n\n• 서울 강남구\n• ㅇㅇ",
  },
  {
    name: "Slack이 묶은 메시지, 마지막이 네",
    expected: true,
    previousAssistantMessage: askedSettings,
    targets: [channel, assignee],
    userMessage: "sp\n\n네",
  },
  {
    name: "설정 확정과 최종 등록을 함께 요청",
    expected: true,
    previousAssistantMessage: askedSettingsAndRegistration,
    targets: [channel, assignee],
    userMessage: "네, 그 설정으로 확정하고 최종 등록 진행해주세요.",
  },
  {
    name: "담당자만 고르고 채널은 그대로",
    expected: true,
    previousAssistantMessage: askedAssigneeOption,
    targets: [channel],
    userMessage:
      "2번으로요. 담당자는 이지은 님으로 지정하고 이대로 역할 생성해 주세요.",
  },
  {
    name: "거절",
    expected: false,
    previousAssistantMessage: askedSettings,
    targets: [channel, assignee],
    userMessage: "아니요",
  },
  {
    name: "진행하지 말라는 답",
    expected: false,
    previousAssistantMessage: askedForReplyWord,
    targets: [channel, assignee],
    userMessage: "등록 진행하지 마세요",
  },
  {
    name: "채널 변경 요청",
    expected: false,
    previousAssistantMessage: askedSettingsAndRegistration,
    targets: [channel, assignee],
    userMessage: "채널은 개발 채널로 바꾸고 등록해 주세요",
  },
  {
    name: "네 했다가 바로 번복",
    expected: false,
    previousAssistantMessage: askedSettings,
    targets: [channel, assignee],
    userMessage: "네\n\n아니 잠깐 채널 바꿔줘",
  },
  {
    name: "다른 질문에만 답함",
    expected: false,
    previousAssistantMessage: askedTwoQuestions,
    targets: [channel, assignee],
    userMessage: "서울 강남구요",
  },
  {
    name: "되묻기",
    expected: false,
    previousAssistantMessage: askedSettings,
    targets: [channel, assignee],
    userMessage: "다른 채널은 뭐가 있어요?",
  },
  {
    name: "담당자는 보류",
    expected: false,
    previousAssistantMessage: askedSettingsAndRegistration,
    targets: [channel, assignee],
    userMessage: "채널은 좋아요. 담당자는 다시 정할게요",
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }
  const { approvesRoleNotificationProposal } =
    await import("../src/lib/org/agent/roleCreationConsentJudge");
  let passed = 0;
  for (const evalCase of cases) {
    const approved = await approvesRoleNotificationProposal(evalCase);
    const ok = approved === evalCase.expected;
    if (ok) passed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"} | ${evalCase.name} | ${approved ? "yes" : "no"}`
    );
  }
  console.log(`\n${passed}/${cases.length} passed`);
  if (passed !== cases.length) process.exitCode = 1;
}

void main();
