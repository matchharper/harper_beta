export type CompanyServiceFaqItem = {
  answer: string;
  key: string;
  question: string;
  tags: readonly string[];
};

export const COMPANY_SERVICE_FAQ_ITEMS = [
  {
    key: "service-overview",
    question:
      "Harper는 뭘 해주는 서비스인가요? 회사 채용팀을 위해 어떤 일을 해주나요?",
    answer:
      "Harper는 단순히 후보자 목록을 보여주는 서비스가 아니라, 회사와 함께 채용을 진행하는 파트너예요. 채용할 역할과 판단 기준을 정리하고, 그 기준에 맞는 분들의 경력을 검토한 뒤 회사와 역할을 먼저 설명해 실제로 대화할 의사가 있는지 확인해요. 후보자가 관심을 표현했다고 바로 회사에 자동 공유되는 것은 아니며, Harper 팀의 마지막 확인을 마친 뒤에만 Inbox의 연결 대기로 도착해요. 회사가 Connect한 뒤에는 Pipeline에서 다음 전형과 결과를 관리할 수 있어요.",
    tags: ["locale:ko", "topic:service-overview"],
  },
  {
    key: "pricing-overview",
    question: "Harper 비용은 어떻게 되나요? 돈은 얼마나 내야 하죠?",
    answer:
      "역할을 만들고 후보자를 추천받아 검토하는 동안에는 별도의 사용료나 월 구독료가 없어요. Harper를 통해 실제 채용이 성사된 경우에만 비용이 발생해요. 구체적인 조건과 금액은 회사에 개별적으로 연락드려 안내해요.",
    tags: ["locale:ko", "topic:pricing"],
  },
  {
    key: "pricing-subscription",
    question: "월 구독료나 사용료가 따로 있나요? 무료인가요?",
    answer:
      "네, 월 구독료나 기본 사용료는 없어요. 다만 Harper를 통해 채용이 성사되면 그때 비용이 발생하므로, 모든 경우에 무료인 서비스라는 뜻은 아니에요. 적용되는 조건과 금액은 회사에 개별적으로 연락드려 안내해요.",
    tags: ["locale:ko", "topic:pricing"],
  },
  {
    key: "pricing-success-fee",
    question:
      "사람을 뽑으면 얼마를 내는 건가요? 채용 성사 수수료율이 정해져 있나요?",
    answer:
      "Harper를 통해 채용이 성사된 경우에만 비용이 발생해요. 공개된 공통 수수료율이나 고정 금액으로 안내하지 않으며, 구체적인 조건과 금액은 회사에 개별적으로 연락드려 설명해요. 아직 안내받지 못했는데 채용 전에 확인이 필요하다면 프로필 메뉴의 문의하기에 회사명과 함께 남겨 주세요.",
    tags: ["locale:ko", "topic:pricing"],
  },
  {
    key: "recommendation-timing",
    question: "Role을 등록했는데 왜 후보자 추천이 바로 오지 않나요?",
    answer:
      "첫 추천까지는 시간이 조금 걸릴 수 있어요. Harper는 단순히 검색된 후보자를 바로 보여드리지 않고, 역할에 맞는 분을 찾고 경력을 검토한 뒤 회사와 역할을 먼저 설명해 실제 대화 의사까지 확인해요. 그래서 Inbox에는 회사가 바로 검토할 수 있는 후보자가 도착하지만, 정확한 추천 시점을 미리 약속하기는 어려워요. 꼭 필요한 조건과 제외 기준, 후보자에게 잘 전달되어야 할 회사의 장점이 최신인지 역할 대화에서 확인해 주세요. 예상보다 오래 걸린다고 느껴지면 프로필 메뉴의 문의하기에 역할 이름을 남겨 주세요.",
    tags: ["locale:ko", "topic:recommendation-timing"],
  },
  {
    key: "pending-connection",
    question: "연결 대기면 후보자가 이미 관심이 있다는 뜻인가요?",
    answer:
      "네. 연결 대기는 후보자가 회사와 역할에 대한 설명을 듣고 이 회사와 대화해 보고 싶다는 의사를 밝힌 뒤, Harper 팀의 마지막 확인까지 마친 상태예요. 후보자가 관심을 표현한 순간 회사에 자동 공유되는 것은 아니며, 단순히 검색에서 찾은 사람이나 Harper가 일방적으로 올린 후보자도 아니에요. 후보자는 지금 회사의 답을 기다리고 있으니, 추천 이유와 자료를 검토한 뒤 Inbox에서 연결을 수락할지 거절할지 알려 주세요. 결정하기에 정보가 부족하다면 먼저 Harper에게 후보자 확인을 요청할 수 있어요.",
    tags: ["locale:ko", "topic:pending-connection"],
  },
  {
    key: "recommendation-paused",
    question: "추천이 오다가 멈췄어요. 새 후보자가 더 안 오는 이유가 뭔가요?",
    answer:
      "먼저 역할이 중단되거나 종료된 상태인지, Inbox의 연결 대기 후보자가 해당 역할의 검토 한도에 도달했는지 확인해 주세요. 중단된 역할을 다시 진행하거나 기존 후보자의 연결을 수락하거나 거절해 대기가 줄면 새 추천이 이어질 수 있어요. 위 상황이 아니라면 역할에 잘 맞고 실제로 대화할 의사가 있는 분을 연결해 드리기 위해 탐색과 확인에 시간이 조금 더 걸리는 중일 수 있어요. 문제가 생겼다고 생각되면 프로필 메뉴의 문의하기에 역할 이름과 현재 상황을 함께 남겨 주세요.",
    tags: ["locale:ko", "topic:recommendation-paused"],
  },
  {
    key: "connect",
    question:
      "이 후보자의 연결 수락은 어떤 의미인가요? Connect 버튼을 누르면 바로 어떻게 되나요?",
    answer:
      "연결 수락은 이 후보자와 직접 대화를 시작하고 싶다는 회사의 결정이에요. 기본 방식인 Email intro를 선택하면 Harper가 후보자와 회사가 고른 담당자를 같은 이메일에 연결해 드려요. 보내기 전에는 연결 방식과 받을 사람을 다시 확인하므로, 질문만 했다고 바로 이메일이 나가지는 않아요. 후보자는 이미 회사와 역할을 듣고 대화 의사를 밝힌 상태이니, 소개 이메일에서는 회사 담당자가 전체 답장으로 인사하고 가능한 일정을 제안하면 돼요. 연결을 수락한다고 인터뷰 일정이 자동 확정되지는 않으며 이후 진행은 Pipeline에서 관리해요.",
    tags: ["locale:ko", "topic:connect"],
  },
  {
    key: "reject",
    question:
      "이 후보자의 연결 거절은 어떤 의미인가요? Reject하면 잠깐 보류되는 건가요?",
    answer:
      "연결 거절은 잠시 보류하는 기능이 아니라, 회사가 이 후보자와 이번 역할의 채용을 더 진행하지 않겠다는 결정이에요. 선택하면 소개 이메일은 보내지 않고, 회사가 진행을 종료했다는 사실이 후보자에게 보이며 Harper가 종료 안내를 시작해요. 후보자가 이미 보거나 전달받은 안내는 나중에 마음이 바뀌어도 회수할 수 없으니 신중하게 선택해 주세요. 아직 판단할 정보가 부족하다면 연결을 거절하기 전에 Harper에게 질문이나 최신 이력서 요청을 맡길 수 있어요. 거절 이유를 남기면 후보자에게 그대로 전달하지 않고 다음 추천을 더 잘 맞추는 데 참고해요.",
    tags: ["locale:ko", "topic:reject"],
  },
  {
    key: "intro-email",
    question: "소개 이메일에는 누가 들어가나요? Email intro 수신자가 궁금해요.",
    answer:
      "Email intro에서는 후보자가 받는 사람에 들어가고, 회사가 선택한 멤버는 CC에 들어가요. 이메일을 받은 뒤 실제로 후보자에게 인사하고 다음 일정을 조율할 담당자를 선택해 주세요. 채용 담당자와 현업 리더가 함께 대화를 이어가야 한다면 두 사람을 모두 포함할 수 있어요. 필요한 담당자가 목록에 보이지 않으면 먼저 Organization의 Members에서 초대해야 해요.",
    tags: ["locale:ko", "topic:intro-email"],
  },
  {
    key: "direct-contact",
    question: "Harper 소개 메일 없이 우리가 후보자에게 직접 연락해도 되나요?",
    answer:
      "가능해요. Direct contact를 요청하면 Harper는 소개 이메일을 보내지 않고 후보자를 연결됨으로 표시해요. 그 뒤 첫 연락과 일정 조율은 회사가 직접 해야 하므로, 바로 연락할 담당자와 연락 방법이 준비됐을 때 선택하는 것이 좋아요. 질문만으로 상태를 바꾸지는 않고, Harper가 이메일을 보내지 않는다는 점과 회사가 직접 연락해야 한다는 점을 다시 확인한 뒤 진행해요. 양쪽을 같은 이메일에서 자연스럽게 이어 주길 원한다면 기본 방식인 Email intro가 더 잘 맞아요.",
    tags: ["locale:ko", "topic:direct-contact"],
  },
  {
    key: "candidate-contact",
    question: "후보자에게 질문하거나 최신 이력서를 요청해줄 수 있나요?",
    answer:
      "네. 연결을 수락하거나 거절하기 전에 필요한 경력 내용을 묻거나 최신 이력서를 요청할 수 있어요. Harper가 후보자에게 보낼 이메일 제목과 본문을 먼저 작성해 그대로 보여드리고, 회사가 문구를 확인한 뒤에만 이메일과 Harper 채팅으로 보내요. 후보자는 답하지 않거나 요청을 거절할 수도 있고 Harper가 자동으로 재촉하지는 않아요. 답변이 오면 요청을 시작한 대화에서 알려드리므로, 그 내용을 확인한 뒤 연결 여부를 결정하면 돼요.",
    tags: ["locale:ko", "topic:candidate-contact"],
  },
  {
    key: "compensation",
    question: "이 후보자의 현재 연봉이나 희망 보상을 알려줄 수 있나요?",
    answer:
      "후보자가 회사에 공유하도록 허용하지 않은 현재 연봉이나 희망 보상은 바로 전달하지 않아요. 필요하다면 Harper가 후보자에게 지금 공유 가능한 보상 정보를 새로 물어볼 수 있어요. 정확한 금액 또는 범위, 기본급 또는 총보상, 통화 중 어떤 형태로 답할지도 후보자가 선택할 수 있게 요청해요. 회사에는 발송 전에 실제 질문 문구를 보여드리므로, 채용 판단에 필요한 범위만 물어보도록 조정할 수 있어요. 이렇게 하면 회사는 후보자의 최신 답변을 받고, 후보자는 공유 범위를 직접 정할 수 있어요.",
    tags: ["locale:ko", "topic:compensation", "topic:privacy"],
  },
  {
    key: "role-status",
    question:
      "Role 채용을 잠깐 중단하는 것과 완전히 종료하는 것은 뭐가 다른가요?",
    answer:
      "잠시 쉬었다가 채용을 다시 이어갈 계획이라면 중단을 선택해 주세요. 새 추천만 멈추고, 이미 연결 대기에 있거나 연결이 시작된 후보자는 그대로 남아 계속 검토할 수 있어요. 종료를 선택하면 새 추천이 멈추고 후보자 화면에서도 해당 역할이 더 이상 열려 있는 기회로 보이지 않아요. 다만 이 변경만으로 기존 후보자의 단계가 모두 종료되거나, 현재 대화 중인 후보자 전원에게 종료 안내가 자동 발송되는 것은 아니에요. 진행 중인 후보자가 있다면 종료 전에 Inbox와 Pipeline을 확인하고, 각 후보자의 실제 결과에 맞게 연결 여부와 종료 안내를 따로 마무리해 주세요.",
    tags: ["locale:ko", "topic:role-status"],
  },
  {
    key: "pipeline",
    question:
      "Pipeline에서 후보자를 다른 칸으로 옮기면 메일도 자동으로 가나요?",
    answer:
      "아니요. Pipeline에서 후보자를 다른 단계로 옮기는 것은 채용팀이 실제 진행 상황을 함께 관리하기 위한 기록이에요. 단계를 옮겨도 후보자에게 이메일이나 Harper 메시지가 자동으로 가지 않고 인터뷰 일정도 만들어지지 않아요. 후보자에게 다음 전형이나 일정을 알려야 한다면 회사가 별도로 연락한 뒤, 실제 진행 상태에 맞춰 Pipeline을 옮겨 주세요. 채용을 끝내려는 경우에는 단순히 칸만 옮기지 말고 후보자 종료 결정과 안내가 필요한지 함께 확인해야 해요.",
    tags: ["locale:ko", "topic:pipeline"],
  },
  {
    key: "scheduling",
    question:
      "면접 캘린더를 잡아줄 수 있나요? 후보자 일정을 Harper가 직접 정해주나요?",
    answer:
      "현재 Harper가 회사와 후보자의 캘린더 일정을 직접 만들거나 확정하지는 못해요. 대신 Email intro를 선택하면 Harper가 양쪽을 같은 이메일에 연결해 드리므로, 회사 담당자가 전체 답장으로 가능한 시간을 제안해 바로 일정을 조율할 수 있어요. 일정이 정해진 뒤에는 실제 전형에 맞춰 후보자를 Pipeline의 다음 단계로 옮겨 주세요. Pipeline 이동만으로 후보자에게 일정이 전달되지는 않아요.",
    tags: ["locale:ko", "topic:scheduling", "topic:limitation"],
  },
  {
    key: "permissions",
    question: "Owner, Admin, Viewer 권한은 어떻게 다른가요?",
    answer:
      "Owner는 멤버 초대와 권한 변경을 포함해 Workspace의 모든 기능을 관리할 수 있어요. Admin은 후보자, Roles, 회사 정보와 Integrations를 관리하고 연결 수락 또는 연결 거절을 결정할 수 있지만, 멤버 초대·제거와 권한 변경은 할 수 없어요. Viewer는 후보자와 회사 정보를 함께 검토할 수 있지만 내용을 변경하거나 연결 여부를 결정할 수는 없어요. 함께 검토만 할 동료는 Viewer로, 후보자 결정과 역할 관리를 맡길 동료는 Admin으로 초대하면 돼요. 멤버 권한 자체를 바꿔야 한다면 Owner에게 요청해 주세요.",
    tags: ["locale:ko", "topic:permissions"],
  },
  {
    key: "slack-notifications",
    question: "Slack에 후보자 추천 알림이 안 와요. 무엇을 확인해야 하나요?",
    answer:
      "Organization의 Integrations에서 Slack이 연결되어 있는지, 해당 역할의 알림을 받을 채널이 선택되어 있는지 먼저 확인해 주세요. 비공개 채널이라면 Slack에서 `/invite @Harper`로 Harper를 초대한 뒤 Integrations에서 채널을 다시 추가해야 해요. 회사에서 Slack 앱 설치 승인이 필요한 경우에는 Slack 관리자가 Harper 설치를 승인했는지도 확인해 주세요. 후보자 정보가 전달되는 채널이므로 실제 채용에 참여하는 멤버만 있는 채널을 권해요. 모두 확인했는데도 알림이 오지 않으면 프로필 메뉴의 문의하기에 역할 이름과 Slack 채널 이름을 함께 남겨 주세요.",
    tags: ["locale:ko", "topic:slack"],
  },
  {
    key: "role-creation",
    question:
      "채용 공고나 JD가 없어도 Role을 만들 수 있나요? 나중에 수정해도 되나요?",
    answer:
      "네, 완성된 JD가 없어도 시작할 수 있어요. 왜 지금 채용하는지, 입사한 분이 맡을 일, 꼭 필요한 경험과 근무 조건을 아는 만큼 편하게 말해 주세요. Harper가 후보자에게 보여줄 Description과 내부 Hiring Brief의 초안을 만들고, 매칭에 중요한 빈칸만 이어서 확인해요. 역할을 등록하기 전에는 알림을 받을 Slack 채널과 주 담당자 한 명도 정해야 해요. 등록한 뒤에도 역할 대화에서 기준을 바꿀 수 있지만, 이미 연결 대기에 있는 후보자는 이전 기준으로 소개됐을 수 있어요. 기준을 크게 바꿨다면 기존 후보자도 새 기준으로 만나볼 분인지 한 명씩 다시 확인해 주세요.",
    tags: ["locale:ko", "topic:role-creation", "topic:role-editing"],
  },
  {
    key: "role-visibility",
    question:
      "Description과 Hiring Brief, Evaluation Criteria는 후보자에게 다 보이나요?",
    answer:
      "모두 후보자에게 보이는 것은 아니에요. Description은 후보자가 회사와 역할을 이해하고 이 기회에 관심을 가질지 판단할 수 있도록 보여주는 설명이에요. Hiring Brief, Evaluation Criteria, Context for Harper에는 회사와 Harper가 후보자를 찾고 검토할 때 사용할 내부 기준을 둘 수 있으며, 공개 JD처럼 후보자에게 자동으로 표시되지는 않아요. 후보자가 미리 알아야 올바르게 판단할 수 있는 업무, 근무 방식, 고용 형태와 중요한 조건은 Description에 정확히 적어 주세요. 내부 항목이라고 해서 직무와 무관한 민감 정보나 차별적인 기준을 적어도 되는 것은 아니에요.",
    tags: ["locale:ko", "topic:role-visibility", "topic:privacy"],
  },
] as const satisfies readonly CompanyServiceFaqItem[];
