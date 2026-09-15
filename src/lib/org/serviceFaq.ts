export type CompanyServiceFaqItem = {
  answer: string;
  key: string;
  question: string;
  showInDocuments?: boolean;
  tags: readonly string[];
};

export const COMPANY_SERVICE_FAQ_ITEMS: readonly CompanyServiceFaqItem[] = [
  {
    key: "service-overview",
    question:
      "Harper는 뭘 해주는 서비스인가요? 회사 채용팀을 위해 어떤 일을 해주나요?",
    answer:
      "Harper는 단순히 후보자 목록을 보여주는 서비스가 아니라, 회사와 함께 채용을 진행하는 파트너예요. 채용할 역할과 판단 기준을 정리하고, 그 기준에 맞는 분들의 경력을 검토한 뒤 후보자에게 회사와 역할을 설명하고 대화 의향을 확인해요. 대화해 보고 싶다고 답한 후보자를 Inbox의 연결 대기 상태로 회사에 소개해요. 회사가 연결을 수락한 뒤에는 Pipeline에서 다음 전형과 결과를 관리할 수 있어요.",
    tags: ["locale:ko", "topic:service-overview"],
  },
  {
    key: "getting-started",
    question: "처음 가입했어요. 이제 뭘 하면 되나요?",
    answer:
      "먼저 Roles를 확인해 주세요. 아직 만든 역할이 없다면 웹 왼쪽 사이드바의 New role을 열거나 Slack에서 Harper에게 “백엔드 엔지니어를 채용하고 싶어요”처럼 편하게 말하면 돼요. 완성된 JD가 없어도 Harper가 대화로 역할과 매칭 기준을 함께 정리하고, 최종 내용을 확인해 등록하면 후보자 탐색을 시작해요. 작성 중인 역할이 있다면 해당 역할 대화에서 등록을 마무리해 주세요. 이미 채용 중인 역할이 있다면 역할 정보가 최신인지와 Inbox에 연결 대기 후보자가 있는지만 확인해 주세요. 연결 대기가 없다면 화면을 계속 열어 둘 필요 없이 기다리면 돼요. 역할에 맞고 회사와 대화할 의사가 확인된 후보자가 생기면 Inbox와 Slack으로 알려드려요. 등록한 역할은 필요할 때 중단하거나 삭제할 수 있어요.",
    tags: ["locale:ko", "topic:getting-started", "topic:role-creation"],
  },
  {
    key: "pricing-overview",
    question: "Harper 비용은 어떻게 되나요? 월 구독료나 채용 수수료가 있나요?",
    answer:
      "월 구독료나 기본 사용료는 없어요. Harper를 통해 채용이 성사된 경우에만 비용이 발생하며, 구체적인 조건과 금액은 회사별로 안내해요. 채용 전에 확인이 필요하다면 프로필 메뉴의 문의하기에 회사명을 함께 남겨 주세요.",
    tags: ["locale:ko", "topic:pricing"],
  },
  {
    key: "pricing-subscription",
    question: "월 구독료나 사용료가 따로 있나요? 무료인가요?",
    answer:
      "네, 월 구독료나 기본 사용료는 없어요. 다만 Harper를 통해 채용이 성사되면 그때 비용이 발생하므로, 모든 경우에 무료인 서비스라는 뜻은 아니에요. 적용되는 조건과 금액은 회사에 개별적으로 연락드려 안내해요.",
    showInDocuments: false,
    tags: ["locale:ko", "topic:pricing"],
  },
  {
    key: "pricing-success-fee",
    question: "채용이 성사되면 비용은 얼마인가요? 수수료율이 정해져 있나요?",
    answer:
      "Harper를 통해 채용이 성사된 경우에만 비용이 발생해요. 공개된 공통 수수료율이나 고정 금액으로 안내하지 않으며, 구체적인 조건과 금액은 회사에 개별적으로 연락드려 설명해요. 아직 안내받지 못했는데 채용 전에 확인이 필요하다면 프로필 메뉴의 문의하기에 회사명과 함께 남겨 주세요.",
    showInDocuments: false,
    tags: ["locale:ko", "topic:pricing"],
  },
  {
    key: "recommendation-timing",
    question: "역할을 등록했는데 왜 후보자 추천이 바로 오지 않나요?",
    answer:
      "첫 추천까지는 시간이 조금 걸릴 수 있어요. Harper는 단순히 검색된 후보자를 바로 보여드리지 않고, 역할에 맞는 분을 찾고 경력을 검토한 뒤 회사와 역할을 먼저 설명해 실제 대화 의사까지 확인해요. 그래서 Inbox에는 회사가 바로 검토할 수 있는 후보자가 도착하지만, 정확한 추천 시점을 미리 약속하기는 어려워요. 꼭 필요한 조건과 제외 기준, 후보자에게 잘 전달되어야 할 회사의 장점이 최신인지 역할 대화에서 확인해 주세요. 예상보다 오래 걸린다고 느껴지면 프로필 메뉴의 문의하기에 역할 이름을 남겨 주세요.",
    tags: ["locale:ko", "topic:recommendation-timing"],
  },
  {
    key: "pending-connection",
    question: "연결 대기는 어떤 상태인가요?",
    answer:
      "연결 대기는 후보자가 회사와 역할에 대한 설명을 듣고 대화해 볼 의사를 밝힌 뒤, 회사의 결정을 기다리는 상태예요. 단순히 검색에서 찾은 사람이나 Harper가 일방적으로 올린 후보자가 아니에요. 추천 이유와 자료를 검토한 뒤 Inbox에서 연결을 수락할지 거절할지 알려 주세요. 결정하기에 정보가 부족하다면 먼저 Harper에게 후보자 확인을 요청할 수 있어요.",
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
    key: "recommendation-feedback",
    question: "추천된 후보자들이 제가 찾는 방향과 조금 달라요.",
    answer:
      "어떤 점이 달랐는지 후보자 이름과 함께 Harper에게 그대로 말해 주세요. 한 후보자만의 아쉬움인지, 이후 추천에도 적용할 공통 기준인지 구분해 반영할게요. 공통 기준이라면 역할의 Hiring Brief나 Evaluation Criteria를 바꾸고 다음 후보자 탐색에 사용해요. 해당 후보자와 진행하지 않으려면 Inbox에서 연결을 거절할 수 있지만, 연결 거절은 보류가 아니라 이번 역할의 진행을 끝내는 결정이에요. 이미 연결 대기에 온 후보자는 이전 기준으로 소개됐을 수 있으므로 새 기준에 맞는지 따로 검토해 주세요.",
    tags: ["locale:ko", "topic:recommendation-feedback", "topic:role-editing"],
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
      "가능해요. Direct contact를 요청하면 Harper는 소개 이메일을 보내지 않고 후보자와의 연결이 시작된 것으로 기록해요. 그 뒤 첫 연락과 일정 조율은 회사가 직접 해야 하므로, 바로 연락할 담당자와 연락 방법이 준비됐을 때 선택하는 것이 좋아요. 질문만으로 상태를 바꾸지는 않고, Harper가 이메일을 보내지 않는다는 점과 회사가 직접 연락해야 한다는 점을 다시 확인한 뒤 진행해요. 양쪽을 같은 이메일에서 자연스럽게 이어 주길 원한다면 기본 방식인 Email intro가 더 잘 맞아요.",
    tags: ["locale:ko", "topic:direct-contact"],
  },
  {
    key: "candidate-contact",
    question: "후보자에게 질문하거나 최신 이력서를 요청해 줄 수 있나요?",
    answer:
      "네. 연결 여부를 정하기 전에도, 연결 후 채용 절차를 진행하는 동안에도 필요한 경력 내용을 묻거나 최신 이력서를 요청할 수 있어요. Harper가 대신 여쭤볼 내용을 자연스러운 연락 문구로 먼저 보여드리고, 회사가 본문을 확인한 뒤에만 후보자에게 보내요. 후보자는 답하지 않거나 요청을 거절할 수도 있어요. 답변이나 자료 제출이 없고 요청이 계속 유효하면, 최초 전달 후 최소 3일이 지난 뒤 Harper가 부담되지 않게 후속 확인 이메일을 한 번 보내요. 답변이 오면 요청을 시작한 대화에서 알려드리므로, 새로 확인한 내용을 바탕으로 연결 여부나 다음 진행을 결정하면 돼요.",
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
    question: "역할을 잠시 중단하는 것과 완전히 종료하는 것은 뭐가 다른가요?",
    answer:
      "잠시 쉬었다가 채용을 다시 이어갈 계획이라면 중단을 선택해 주세요. 새 추천만 멈추고, 이미 진행 중인 후보자는 그대로 검토할 수 있어요. 종료를 선택하면 새 추천이 멈추고 역할이 종료 상태로 바뀌어요. 이 상태 변경과 동시에 안내가 발송되는 것은 아니지만, 유예 기간이 지나면 수락 후 진행 중인 후보자에게 Harper가 종료를 안내하고 해당 후보자의 채용 진행을 종료해요. 1차 인터뷰 같은 중간 단계도 동일하게 처리하며, 최종 오퍼 단계만 자동 종료에서 제외해 따로 관리해요.",
    tags: ["locale:ko", "topic:role-status"],
  },
  {
    key: "pipeline",
    question:
      "Pipeline에서 후보자를 다른 칸으로 옮기면 메일도 자동으로 가나요?",
    answer:
      "아니요. Pipeline에서 후보자를 다른 단계로 옮기는 것은 채용팀이 실제 진행 상황을 함께 관리하기 위한 기록이에요. 단계만 옮기면 후보자에게 이메일이나 Harper 메시지가 가지 않고 인터뷰 일정도 만들어지지 않아요. 다음 전형 안내나 일정 조율이 필요하면 단계 이동과 함께 Harper에게 후보자 연락 또는 인터뷰 일정 조율을 요청하거나, 회사가 직접 연락해야 해요. 채용을 끝내려는 경우에도 단순히 칸만 옮기지 말고 후보자 종료 결정과 안내가 필요한지 함께 확인해 주세요.",
    tags: ["locale:ko", "topic:pipeline"],
  },
  {
    key: "scheduling",
    question: "면접 일정도 Harper가 조율해 주나요?",
    answer:
      "네. 일정 담당자가 Google Calendar를 연결하고 가능한 시간을 설정해 두면 Harper가 일정 조율을 맡을 수 있어요. 이미 바쁜 시간을 제외한 선택지를 후보자에게 보내고, 후보자가 시간을 고르면 회사 참석자와 후보자의 Google Calendar에 일정을 만들고 Google Meet 링크를 함께 전달해요. Google Calendar 연결이나 담당자의 가능 시간 설정이 없다면 먼저 준비해야 하며, 후보자를 Pipeline의 다른 단계로 옮기는 것만으로 일정 요청이 자동 발송되지는 않아요.",
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
      "채용 공고나 JD가 없어도 역할을 만들 수 있나요? 나중에 수정해도 되나요?",
    answer:
      "네, 완성된 JD가 없어도 시작할 수 있어요. 왜 지금 채용하는지, 입사한 분이 맡을 일, 꼭 필요한 경험과 근무 조건을 아는 만큼 편하게 말해 주세요. 원하는 수준을 말로 설명하기 어렵다면 기준이 될 만한 사람의 LinkedIn·GitHub·소개 자료와 함께 어떤 점을 참고하면 좋을지도 알려 주세요. Harper는 그 사람을 곧바로 후보자로 판단하지 않고, 팀이 중요하게 보는 수준과 강점을 역할 기준에 반영해요. 역할을 등록하기 전에는 알림을 받을 Slack 채널과 주 담당자 한 명도 정해야 해요. 등록한 뒤에도 역할 대화에서 기준을 바꿀 수 있지만, 이미 연결 대기에 있는 후보자는 이전 기준으로 소개됐을 수 있어요. 기준을 크게 바꿨다면 기존 후보자도 새 기준으로 만나볼 분인지 한 명씩 다시 확인해 주세요.",
    tags: ["locale:ko", "topic:role-creation", "topic:role-editing"],
  },
  {
    key: "exploratory-hiring",
    question:
      "채용 계획이 아직 구체적이지 않아요. 좋은 분이 있으면 일단 만나보고 싶어요.",
    answer:
      "완성된 JD나 모든 조건이 정해져 있을 필요는 없어요. 다만 Harper는 후보자 목록을 먼저 둘러보는 방식이 아니라, 등록된 역할의 실제 업무와 기준에 맞춰 후보자를 찾아요. 아직 정하지 못한 조건은 New role 대화에서 열린 내용으로 알려 주고, 지금 분명한 핵심 업무와 꼭 필요한 기준부터 함께 정리해 등록해 주세요. 등록이 끝나면 그 기준으로 후보자를 검토하고, 회사와 역할을 설명한 뒤 실제로 대화할 의사가 있는 분만 Inbox의 연결 대기로 소개해요.",
    tags: ["locale:ko", "topic:exploratory-hiring", "topic:role-creation"],
  },
  {
    key: "role-visibility",
    question:
      "Description과 Hiring Brief, Evaluation Criteria는 후보자에게 다 보이나요?",
    answer:
      "모두 후보자에게 보이는 것은 아니에요. Description은 후보자가 회사와 역할을 이해하고 이 기회에 관심을 가질지 판단할 수 있도록 보여주는 설명이에요. Hiring Brief, Evaluation Criteria, Context for Harper에는 회사와 Harper가 후보자를 찾고 검토할 때 사용할 내부 기준을 둘 수 있으며, 공개 JD처럼 후보자에게 자동으로 표시되지는 않아요. 후보자가 미리 알아야 올바르게 판단할 수 있는 업무, 근무 방식, 고용 형태와 중요한 조건은 Description에 정확히 적어 주세요. 내부 항목이라고 해서 직무와 무관한 민감 정보나 차별적인 기준을 적어도 되는 것은 아니에요.",
    tags: ["locale:ko", "topic:role-visibility", "topic:privacy"],
  },
];
