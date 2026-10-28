export type CompanyServiceFaqItem = {
  answer: string;
  category: string;
  key: string;
  question: string;
  showInDocuments?: boolean;
  tags: readonly string[];
};

// Shared factual guidance for Company retrieval and /org/documents.
export const COMPANY_SERVICE_FAQ_ITEMS: readonly CompanyServiceFaqItem[] = [
  {
    key: "service-overview",
    question:
      "Harper는 뭘 해주는 서비스인가요? 회사 채용팀을 위해 어떤 일을 해주나요?",
    answer:
      "저희는 회사와 함께 채용을 진행하는 파트너예요. 역할과 판단 기준을 정리하고, 맞는 후보자를 찾아 경력과 근무 조건을 검토해요. 연결 제안할 후보에서는 회사가 만나보고 싶은 사람을 고르고 Intro를 요청할 수 있어요. 후보자가 수락하면 미리 선택한 팀원과 소개 이메일로 연결해요. 연결 수락할 후보에서는 Harper가 먼저 역할을 소개하고 대화 의사를 확인한 후보자를 검토해 회사가 연결 여부를 결정해요. 기존 별도 계약의 이용 범위는 해당 계약을 따르며, 연결 후에는 후보자 연락과 일정 조율을 맡기고 Pipeline에서 전형을 관리할 수 있어요.",
    tags: ["locale:ko", "topic:service-overview"],
    category: "시작과 역할",
  },
  {
    key: "getting-started",
    question: "처음 가입했어요. 이제 뭘 하면 되나요?",
    answer:
      "먼저 회사 정보와 Pitch를 확인하고, 함께 채용할 팀원과 Slack 알림 채널을 준비해 주세요. 역할이 없다면 웹의 New role을 열거나 Slack에서 Harper에게 채용하고 싶은 역할을 말하면 돼요. 완성된 JD 없이도 대화로 Description과 Hiring Brief를 정리할 수 있어요. 작성 중인 역할은 등록을 마무리하고, 채용 중인 역할은 Settings의 추천 후보 검색과 요일·시각을 확인해 주세요. 연결 제안할 후보에서 Intro를 요청하고, 이용 가능한 Role의 Inbox에 연결 수락할 후보가 있으면 연결 여부를 결정하면 돼요. 검토할 후보가 없다면 화면을 계속 열어 둘 필요는 없어요. 역할은 필요할 때 중단하거나 삭제할 수 있어요.",
    tags: ["locale:ko", "topic:getting-started", "topic:role-creation"],
    category: "시작과 역할",
  },
  {
    key: "pricing-overview",
    question: "Harper 비용은 어떻게 되나요? 월 구독료나 채용 수수료가 있나요?",
    answer:
      "Role은 자유롭게 만들 수 있고, Free Role은 한 번에 1개까지 채용을 진행할 수 있어요. 전체 Role이 함께 쓰는 월 3 Intro는 슬롯을 추가해도 별도로 유지돼요. 표준 슬롯은 활성 Role 하나와 그 Role의 월 50 Intro를 추가로 제공하고, Free와 표준 슬롯 구독에는 채용 성공보수가 없어요. Enterprise와 기존 별도 계약은 합의한 조건을 따라요. 현재 새 회사의 직접 가입과 일반 회사의 셀프서비스 결제는 일시 중단되어 있어요. Slots와 Billing 메뉴가 표시되는 Workspace에서는 배정·구독·결제 내역을 확인할 수 있고, 메뉴가 없거나 적용 조건이 궁금하면 문의하기로 Harper 팀에 확인해 주세요. /pricing의 공개 상품 설명만으로 회사의 실제 계약이나 잔액을 판단하지 않아요.",
    tags: ["locale:ko", "topic:pricing"],
    category: "슬롯과 비용",
  },
  {
    key: "pricing-subscription",
    question: "월 구독료나 사용료가 따로 있나요? 무료인가요?",
    answer:
      "Free와 월간·연간 표준 슬롯 구독이 있어요. 연간 구독은 1년 이용료를 한 번에 결제하지만 Intro는 월 단위로 갱신돼요. 현재 일반 회사의 셀프서비스 결제는 일시 중단되어 있어 바로 슬롯을 구매하도록 안내하지 않아요. 결제 메뉴가 표시되는 Workspace에서는 Slots와 Billing에서 현재 구독을 확인하고, 메뉴가 없으면 Harper 팀에 적용 계약과 이용 범위를 문의해 주세요.",
    showInDocuments: false,
    tags: ["locale:ko", "topic:pricing"],
    category: "슬롯과 비용",
  },
  {
    key: "pricing-success-fee",
    question: "채용이 성사되면 비용은 얼마인가요? 수수료율이 정해져 있나요?",
    answer:
      "Free와 표준 슬롯 구독에는 채용 성공보수가 없어요. 요청하신 Enterprise에는 성공보수를 포함한 별도 비용 모델을 합의할 수 있어요. 기존에 별도 계약이 있다면 해당 계약의 조건을 따라요. 회사에 적용되는 조건과 금액은 Harper 팀에 회사명을 알려주시면 확인할 수 있어요.",
    showInDocuments: false,
    tags: ["locale:ko", "topic:pricing"],
    category: "슬롯과 비용",
  },
  {
    key: "recommendation-timing",
    question: "역할을 등록했는데 왜 후보자 추천이 바로 오지 않나요?",
    answer:
      "역할 등록은 후보자가 발견되거나 연락이 끝났다는 뜻은 아니에요. 현재 기준에 맞는 후보자를 찾고 검토하는 데 시간이 필요해요. 연결 제안할 후보는 후보자의 수락 전에 회사가 검토하는 목록이고, 연결 수락할 후보는 Harper의 추천을 수락한 후보자를 소개한 상태예요. 두 목록의 도착 시점은 다를 수 있고 적합한 후보가 없으면 새 항목이 없을 수도 있어요. Settings의 검색 설정과 저장된 Hiring Brief를 확인하고, 지금 새 후보를 찾고 싶으면 역할 대화의 Run Search를 사용할 수 있어요. 이 요청도 추천 수나 도착 시점을 보장하지는 않아요.",
    tags: ["locale:ko", "topic:recommendation-timing"],
    category: "검색과 추천",
  },
  {
    key: "pending-connection",
    question: "연결 수락할 후보와 연결 제안할 후보는 어떻게 다른가요?",
    answer:
      "연결 제안할 후보는 이 역할을 아직 수락하지 않은 사람을 회사가 먼저 검토하는 목록이에요. 이전에 Harper의 추천을 받았거나 거절한 경우도 있으므로 처음 보는 역할이거나 관심이 확인된 후보라고 단정하지 않아요. Intro 요청을 확정하면 Harper가 회사의 관심 이유를 담아 제안하고, 후보자가 수락하면 미리 고른 팀원과 소개 이메일로 연결해요. 연결 수락할 후보는 후보자가 회사와 역할에 대한 설명을 듣고 대화해 볼 의사를 밝힌 뒤 회사의 결정을 기다리는 상태예요. Free Role에서도 이용할 수 있으며, 회사가 연결을 수락하거나 거절해야 해요. 후보자의 수락과 회사에 실제로 소개가 전달된 시점은 다를 수 있어요.",
    tags: ["locale:ko", "topic:pending-connection"],
    category: "제안과 연결",
  },
  {
    key: "recommendation-paused",
    question: "추천이 오다가 멈췄어요. 새 후보자가 더 안 오는 이유가 뭔가요?",
    answer:
      "역할이 중단·종료된 상태인지, Settings의 추천 후보 검색이 켜져 있는지와 다음 검색 요일·시각을 먼저 확인해 주세요. 연결 수락할 후보가 해당 역할의 검토 한도에 도달하면 새 후보자에게 먼저 추천하는 일부 탐색이 제한돼요. 기존 후보자의 연결을 수락하거나 거절해 대기가 줄면 그 제한이 풀릴 수 있지만, 연결 제안할 후보 검색까지 모두 멈춘다는 뜻은 아니에요. Role의 활성 상태, 미처리 제안, 적합한 후보의 유무도 영향을 줄 수 있어요. Harper에게 최근 검색 이력을 물어 현재 확인되는 범위를 보고, 해결되지 않으면 문의하기에 역할 이름과 상황을 남겨 주세요.",
    tags: ["locale:ko", "topic:recommendation-paused"],
    category: "검색과 추천",
  },
  {
    key: "recommendation-feedback",
    question: "추천된 후보자들이 제가 찾는 방향과 조금 달라요.",
    answer:
      "어떤 점이 달랐는지 후보자 이름과 함께 말씀해 주세요. 한 후보자에 대한 판단인지 이후 추천에도 적용할 공통 기준인지 구분해 반영할게요. 공통 기준이라면 Hiring Brief나 Evaluation Criteria의 수정안을 확인한 뒤 다음 탐색에 사용해요. 연결 제안할 후보의 Pass는 연락 없이 목록에서 제외하는 결정이고, 연결 수락할 후보의 연결 거절은 보류가 아니라 이번 역할의 진행을 끝내는 결정이에요. 이미 소개된 후보자는 이전 기준으로 검토됐을 수 있어 새 기준에서도 맞는지 따로 확인해야 해요.",
    tags: ["locale:ko", "topic:recommendation-feedback", "topic:role-editing"],
    category: "검색과 추천",
  },
  {
    key: "connect",
    question: "Accept Intro를 누르면 어떻게 되나요?",
    answer:
      "Accept Intro를 누르면 이메일로 소개받거나 바로 인터뷰를 요청하는 방식을 선택할 수 있어요. 이메일로 연결받기를 선택하면 Harper가 후보자와 선택한 회사 팀원을 소개 이메일로 연결해 드려요. 바로 인터뷰 요청을 선택하면 후보자가 가능한 시간을 고를 수 있도록 일정 선택 링크를 보내요. 버튼을 처음 누르는 것만으로 발송되지는 않으며, 방식과 세부 내용을 확인한 뒤 수락하면 진행돼요. 후보자는 이미 이 역할에 대한 대화 의사를 밝힌 상태지만, Intro 수락만으로 인터뷰 일정이 확정되는 것은 아니에요.",
    tags: ["locale:ko", "topic:connect"],
    category: "제안과 연결",
  },
  {
    key: "reject",
    question:
      "이 후보자의 연결 거절은 어떤 의미인가요? Reject하면 잠깐 보류되는 건가요?",
    answer:
      "연결 거절은 잠시 보류하는 기능이 아니라, 회사가 이 후보자와 이번 역할의 채용을 더 진행하지 않겠다는 결정이에요. 선택하면 소개 이메일은 보내지 않고, 회사가 진행을 종료했다는 사실이 후보자에게 보이며 Harper가 종료 안내를 시작해요. 후보자가 이미 보거나 전달받은 안내는 나중에 마음이 바뀌어도 회수할 수 없으니 신중하게 선택해 주세요. 아직 판단할 정보가 부족하다면 연결을 거절하기 전에 Harper에게 질문이나 최신 이력서 요청을 맡길 수 있어요. 거절 이유를 남기면 후보자에게 그대로 전달하지 않고 다음 추천을 더 잘 맞추는 데 참고해요.",
    tags: ["locale:ko", "topic:reject"],
    category: "제안과 연결",
  },
  {
    key: "intro-email",
    question: "소개 이메일에는 누가 들어가나요? Email intro 수신자가 궁금해요.",
    answer:
      "소개 이메일은 후보자에게 보내고 회사가 선택한 팀원을 CC에 넣어요. 후보자에게 인사하고 다음 일정을 조율할 담당자를 선택해 주세요. 여러 팀원을 함께 포함할 수 있으며, 필요한 팀원이 목록에 없다면 Owner가 Organization의 Members에서 초대해야 해요. 회사가 Intro를 요청할 때는 후보자가 수락한 뒤 이 팀원들에게 소개 이메일이 전달되므로 수신자를 미리 정해요.",
    tags: ["locale:ko", "topic:intro-email"],
    category: "제안과 연결",
  },
  {
    key: "direct-contact",
    question: "Harper 소개 메일 없이 우리가 후보자에게 직접 연락해도 되나요?",
    answer:
      "네, 가능해요. Direct contact를 요청하면 Harper는 소개 이메일을 보내지 않고 후보자와의 연결이 시작된 것으로 기록해요. 그 뒤 첫 연락과 일정 조율은 회사가 직접 해야 하므로, 바로 연락할 담당자와 연락 방법이 준비됐을 때 선택하는 것이 좋아요. 질문만으로 상태를 바꾸지는 않고, Harper가 이메일을 보내지 않는다는 점과 회사가 직접 연락해야 한다는 점을 다시 확인한 뒤 진행해요. 양쪽을 같은 이메일에서 자연스럽게 이어 주길 원한다면 기본 방식인 Email intro가 더 잘 맞아요.",
    tags: ["locale:ko", "topic:direct-contact"],
    category: "제안과 연결",
  },
  {
    key: "candidate-contact",
    question: "후보자에게 질문하거나 최신 이력서를 요청해 줄 수 있나요?",
    answer:
      "네, 연결 수락할 후보에서 결정하기 전이나 연결 후 진행 중에도 질문·이력서 요청·정보 전달을 맡길 수 있어요. 연결 제안한 후보에서도 제안이 전달되어 후보자 답변을 기다리는 중이라면 추가 연락을 요청할 수 있어요. 아직 Intro를 요청하지 않은 후보에게는 먼저 역할 제안 절차가 필요해요. 대상과 전달할 내용이 명확한 일상적인 연락은 바로 전달하고, 첫 연락이나 회사의 인상이 중요한 제안은 초안을 먼저 확인해요. 초안을 만들거나 고친 것만으로 발송되지는 않아요. 답변이나 자료 제출을 요청했고 그 요청이 계속 유효하면 최초 전달 후 최소 3일 뒤 후속 확인 이메일을 한 번 보낼 수 있어요. 답변이 오면 요청을 시작한 대화에서 알려드려요. 추가 연락이 후보자의 수락이나 연결을 대신하지는 않아요.",
    tags: ["locale:ko", "topic:candidate-contact"],
    category: "후보자 소통과 전형",
  },
  {
    key: "compensation",
    question: "이 후보자의 현재 연봉이나 희망 보상을 알려줄 수 있나요?",
    answer:
      "후보자가 회사에 공유하도록 허용하지 않은 현재 연봉이나 희망 보상 수치는 전달하지 않아요. 프로필과 Harper Note에도 비공개 보상 정보를 그대로 표시하지 않아요. 필요하다면 후보자에게 새로 물어보고 회사에 공유할 범위를 직접 정하도록 요청할 수 있어요. 정확한 금액이나 범위, 기본급 또는 총보상, 통화 등 판단에 필요한 내용만 알려 주세요. 공유가 허용된 실제 답변을 확인한 뒤 회사에 전달하며, 답변이 없으면 금액을 추정하지 않아요.",
    tags: ["locale:ko", "topic:compensation", "topic:privacy"],
    category: "후보자 소통과 전형",
  },
  {
    key: "role-status",
    question: "역할을 잠시 중단하는 것과 완전히 종료하는 것은 뭐가 다른가요?",
    answer:
      "잠시 쉬었다가 채용을 다시 이어갈 계획이라면 중단을 선택해 주세요. 새 추천만 멈추고, 이미 진행 중인 후보자는 그대로 검토할 수 있어요. 종료를 선택하면 새 추천이 멈추고 역할이 종료 상태로 바뀌어요. 이 상태 변경과 동시에 안내가 발송되는 것은 아니지만, 유예 기간이 지나면 수락 후 진행 중인 후보자에게 Harper가 종료를 안내하고 해당 후보자의 채용 진행을 종료해요. 1차 인터뷰 같은 중간 단계도 동일하게 처리하며, 최종 오퍼 단계만 자동 종료에서 제외해 따로 관리해요.",
    tags: ["locale:ko", "topic:role-status"],
    category: "후보자 소통과 전형",
  },
  {
    key: "pipeline",
    question:
      "Pipeline에서 후보자를 다른 칸으로 옮기면 메일도 자동으로 가나요?",
    answer:
      "아니요. Pipeline에서 후보자를 다른 단계로 옮기는 것은 채용팀이 실제 진행 상황을 함께 관리하기 위한 기록이에요. 단계만 옮기면 후보자에게 이메일이나 Harper 메시지가 가지 않고 인터뷰 일정도 만들어지지 않아요. 다음 전형 안내나 일정 조율이 필요하면 단계 이동과 함께 Harper에게 후보자 연락 또는 인터뷰 일정 조율을 요청하거나, 회사가 직접 연락해야 해요. 채용을 끝내려는 경우에도 단순히 칸만 옮기지 말고 후보자 종료 결정과 안내가 필요한지 함께 확인해 주세요.",
    tags: ["locale:ko", "topic:pipeline"],
    category: "후보자 소통과 전형",
  },
  {
    key: "scheduling",
    question: "면접 일정도 Harper가 조율해 주나요?",
    answer:
      "네. 일정 담당자가 Settings의 일정 저장에서 Google Calendar를 연결하고 가능한 시간을 설정하면 Harper가 면접 일정을 조율할 수 있어요. 연결된 Calendar에서 이미 바쁜 시간을 제외해 후보자에게 선택지를 보내고, 후보자가 시간을 고르면 회사 참석자와 후보자에게 Calendar 초대와 Google Meet 링크를 전달해요. 누구와 어떤 역할의 무슨 대화를 할지 알려 주세요. 후보자가 아직 회사 제안을 수락하지 않았다면 먼저 수락이 필요해요. Pipeline의 다른 단계로 옮기는 것만으로 일정 요청이 발송되지는 않으며, 기존 미팅이 확정됐다는 사실만으로 새 미팅의 초대가 전달됐다고 판단하지 않아요.",
    tags: ["locale:ko", "topic:scheduling", "topic:limitation"],
    category: "후보자 소통과 전형",
  },
  {
    key: "permissions",
    question: "Owner, Admin, Viewer 권한은 어떻게 다른가요?",
    answer:
      "Owner는 팀원 초대·제거와 권한 변경을 포함해 Workspace를 관리해요. Admin은 후보자, Roles, 회사 정보와 Integrations를 관리하고 연결 여부를 결정할 수 있지만 팀원 관리와 결제 관리는 Owner의 영역이에요. Viewer는 회사와 후보자 정보를 검토할 수 있지만 내용 변경이나 연결 결정은 할 수 없어요. 검토만 함께할 팀원은 Viewer로, 후보자 결정과 역할 관리를 맡길 팀원은 Admin으로 초대하면 돼요. Slack에서도 연결된 팀원의 권한을 따르므로 채널에 들어와 있다는 이유만으로 변경 권한이 생기지는 않아요.",
    tags: ["locale:ko", "topic:permissions"],
    category: "팀과 연동",
  },
  {
    key: "slack-notifications",
    question: "Slack에 후보자 추천 알림이 안 와요. 무엇을 확인해야 하나요?",
    answer:
      "Organization의 Integrations에서 Slack이 연결되어 있는지, 해당 역할의 알림을 받을 채널이 선택되어 있는지 먼저 확인해 주세요. 비공개 채널이라면 Slack에서 `/invite @Harper`로 Harper를 초대한 뒤 Integrations에서 채널을 다시 추가해야 해요. 회사에서 Slack 앱 설치 승인이 필요한 경우에는 Slack 관리자가 Harper 설치를 승인했는지도 확인해 주세요. 후보자 정보가 전달되는 채널이므로 실제 채용에 참여하는 팀원만 있는 채널을 권해요. 모두 확인했는데도 알림이 오지 않으면 프로필 메뉴의 문의하기에 역할 이름과 Slack 채널 이름을 함께 남겨 주세요.",
    tags: ["locale:ko", "topic:slack"],
    category: "팀과 연동",
  },
  {
    key: "role-creation",
    question:
      "채용 공고나 JD가 없어도 역할을 만들 수 있나요? 나중에 수정해도 되나요?",
    answer:
      "그럼요 ㅎㅎ 완성된 JD가 없어도 시작할 수 있어요. 왜 지금 채용하는지, 입사한 분이 맡을 일, 꼭 필요한 경험과 근무 조건을 아는 만큼 편하게 알려주시면 돼요. 원하는 수준을 말로 설명하기 어렵다면 기준이 될 만한 사람의 LinkedIn·GitHub·소개 자료와 함께 어떤 점을 참고하면 좋을지도 알려 주세요. Harper는 그 사람을 곧바로 후보자로 판단하지 않고, 팀이 중요하게 보는 수준과 강점을 역할 기준에 반영해요. 역할을 등록하기 전에는 알림을 받을 Slack 채널과 주 담당자 한 명도 정해야 해요. 등록한 뒤에도 역할 대화에서 기준을 바꿀 수 있지만, 이미 연결 수락할 후보에 있는 후보자는 이전 기준으로 소개됐을 수 있어요. 기준을 크게 바꿨다면 기존 후보자도 새 기준으로 만나볼 분인지 한 명씩 다시 확인해 주세요.",
    tags: ["locale:ko", "topic:role-creation", "topic:role-editing"],
    category: "시작과 역할",
  },
  {
    key: "exploratory-hiring",
    question:
      "채용 계획이 아직 구체적이지 않아요. 좋은 분이 있으면 일단 만나보고 싶어요.",
    answer:
      "괜찮아요. 완성된 JD가 없어도 등록된 역할의 실제 업무와 기준부터 함께 정리할 수 있어요. 아직 정하지 못한 조건은 New role 대화에서 열린 내용으로 알려 주세요. 등록 후 연결 제안할 후보에서 회사가 먼저 만나보고 싶은 사람을 고를 수 있어요. 이 목록은 관심이나 지원 의사가 이미 확인됐다는 뜻은 아니며, Intro 요청을 보내고 후보자가 수락해야 연결돼요. 이용 가능한 Role에서는 Harper가 먼저 역할을 소개하고 실제로 대화할 의사가 있는 분만 연결 수락할 후보로 소개하는 방식도 함께 사용할 수 있어요.",
    tags: ["locale:ko", "topic:exploratory-hiring", "topic:role-creation"],
    category: "시작과 역할",
  },
  {
    key: "role-visibility",
    question:
      "Description과 Hiring Brief, Evaluation Criteria는 후보자에게 다 보이나요?",
    answer:
      "Description은 후보자가 회사와 역할을 이해하는 데 쓰이는 공개 설명이에요. Hiring Brief와 Evaluation Criteria는 회사와 Harper가 후보자를 검토하는 내부 기준이고, Context for Harper는 지속적으로 참고할 회사·역할 맥락이에요. 내부 문서가 공개 JD처럼 자동 표시되지는 않아요. 새 Role의 기본 작성물은 Description과 Hiring Brief이며 Evaluation Criteria는 필요한 경우 별도로 정리해요. 한 문서를 바꿨다고 나머지 문서를 자동으로 전부 다시 쓰지는 않아요. 후보자가 판단에 필요한 업무·근무 조건은 Description에 정확히 담고, 외부 공고 노출과 회사명 공개 여부는 Role Settings에서 별도로 확인해 주세요.",
    tags: ["locale:ko", "topic:role-visibility", "topic:privacy"],
    category: "시작과 역할",
  },
  {
    key: "signup-invitations",
    category: "시작과 역할",
    question: "회사 Workspace에 가입하거나 팀원을 초대하려면 어떻게 하나요?",
    answer:
      "현재 새 회사가 직접 Workspace를 만드는 가입은 일시 중단되어 있어요. 이미 초대받았다면 초대한 이메일로 로그인해 초대를 수락하고, 회사에 Workspace가 있다면 Owner에게 팀원 초대를 요청해 주세요. 같은 회사 이메일 주소로 로그인한다고 자동으로 팀원이 되지는 않아요. 새 회사의 도입은 회사 페이지의 상담 요청이나 문의하기로 Harper 팀과 상의할 수 있어요.",
    tags: ["locale:ko", "topic:signup-invitations"],
  },
  {
    key: "company-pitch-memory",
    category: "시작과 역할",
    question: "회사 소개와 Pitch, Context for Harper에는 무엇을 적나요?",
    answer:
      "Pitch에는 회사가 무엇을 만들고 어떤 성과·문화·혜택 때문에 합류할 만한지 후보자에게 설명할 근거를 적어요. 회사 전체에 계속 참고할 배경이나 운영 맥락은 Context for Harper에, 특정 Role의 필수·선호 기준은 Hiring Brief에 정리해요. Harper에게 회사 정보나 기억을 물어보고 수정할 수 있으며, 기억이나 Hiring Brief 변경은 수정안을 확인한 뒤 반영해요. 후보자 한 명의 일시적인 상황을 회사 전체의 기준으로 저장하지 않아요.",
    tags: ["locale:ko", "topic:company-pitch-memory"],
  },
  {
    key: "role-reference",
    category: "시작과 역할",
    question: "참고 인물로 채용 기준을 맞출 수 있나요?",
    answer:
      "네. 참고할 실제 인물의 LinkedIn·GitHub·소개 자료와 중요한 강점을 전달해 주세요. 확인된 경력과 판단 이유를 바탕으로 Hiring Brief를 다듬어요. 참고 인물은 회사가 별도로 후보 평가를 요청하지 않았다면 바로 후보자로 취급하지 않아요.",
    tags: ["locale:ko", "topic:role-reference"],
  },
  {
    key: "regular-search",
    category: "검색과 추천",
    question:
      "정기 후보 검색은 언제 실행되나요? 요일과 시간을 바꾸거나 끌 수 있나요?",
    answer:
      "Role Settings의 추천 후보 검색에서 켜기·끄기와 요일·시각을 정해요. 새 Role의 기본은 켜짐, 한국 시간 월·수·금 오전 9시이며 기존 Role은 저장된 설정을 따라요. 이 설정은 회사가 먼저 검토할 후보의 정기 탐색을 관리해요. 꺼도 명시적인 Run Search 요청은 별도로 가능하고, Free를 포함한 활성 Role의 후보자 선추천까지 끄는 설정은 아니에요. 설정 변경으로 이미 시작한 검색이나 전달된 제안이 취소되지는 않아요.",
    tags: ["locale:ko", "topic:regular-search"],
  },
  {
    key: "run-search",
    category: "검색과 추천",
    question:
      "Run Search를 누르면 무엇이 달라지나요? 후보자에게 바로 연락하나요?",
    answer:
      "Run Search는 저장된 현재 Hiring Brief를 바탕으로 회사가 먼저 Intro를 요청할 만한 새 후보를 찾는 요청이에요. 기존 후보 목록을 다시 보여 달라는 요청과 다르고 정기 예약 시각을 기다리지 않아요. 찾은 후보는 검토한 뒤 연결 제안할 후보로 소개할 수 있지만 검색만으로 후보자에게 회사 제안을 보내지는 않아요. 실제 연락은 회사가 Intro 요청을 확정한 뒤 시작해요. 진행 중인 같은 검색이 있으면 그 상태를 확인하며, 결과는 적거나 없을 수도 있어요.",
    tags: ["locale:ko", "topic:run-search"],
  },
  {
    key: "search-history",
    category: "검색과 추천",
    question: "최근 후보 검색이 언제 있었고 몇 명을 검토했는지 알 수 있나요?",
    answer:
      "Harper에게 최근 검색 이력을 물어보면 확인된 실행 시각·계기, 검토 인원과 선정 집계를 설명해요. 더 오래된 기록도 요청할 수 있어요. 선정 인원은 실제 발송이나 후보자의 수락 인원과 같지 않고, 기록이 없는 수치를 0명으로 설명하지 않아요. 후보자에게 먼저 추천한 개인별 내역과 비공개 판단은 회사에 공개하지 않으며, 실제 전달·응답은 회사에 공유된 후보자의 확인 가능한 기록으로 따로 봐야 해요.",
    tags: ["locale:ko", "topic:search-history"],
  },
  {
    key: "candidate-profile-summary",
    category: "검색과 추천",
    question: "후보자 프로필의 TL;DR, Harper Note와 적합성은 무엇인가요?",
    answer:
      "TL;DR은 확인된 경력과 실제 기여를 짧게 요약하고, Harper Note는 공유 가능한 다음 업무·책임·근무 조건·합류 시점 등의 맥락을 설명해요. 적합성과 기준별 평가는 저장된 Role 기준에 대한 참고 자료이지 후보자의 지원·수락이나 채용 성공을 보장하지 않아요. 없는 정보는 확인할 부분으로 남겨 두고, 비공개 보상 수치나 다른 회사와의 대화 내역은 공개하지 않아요. 연결 제안할 후보의 자료는 제한된 공개 범위이며, 수락 전 이력서나 연락처를 요청한다고 바로 열리지는 않아요.",
    tags: ["locale:ko", "topic:candidate-profile-summary"],
  },
  {
    key: "intro-request",
    category: "제안과 연결",
    question: "Intro 요청에는 무엇이 필요하고 Pass와 어떻게 다른가요?",
    answer:
      "Intro 요청에는 이 후보자를 만나보고 싶은 구체적인 이유와, 수락 후 소개 이메일을 받을 회사 팀원이 필요해요. 내용을 확인해 요청을 확정하면 Harper가 회사와 역할을 소개하며 후보자에게 대화 의사를 물어요. 후보자가 수락하면 미리 선택한 팀원과 이메일로 연결되고 기본적으로 연결됨으로 이동하므로 회사의 두 번째 연결 승인을 기다리지 않아요. 별도 전형 단계는 필수가 아니에요. Pass는 후보자에게 연락하거나 알림을 보내지 않고 해당 제안을 목록에서 제외하는 결정이에요.",
    tags: ["locale:ko", "topic:intro-request"],
  },
  {
    key: "intro-awaiting",
    category: "제안과 연결",
    question:
      "연결 제안한 후보는 무엇을 기다리는 상태인가요? 답이 없으면 거절인가요?",
    answer:
      "연결 제안한 후보는 회사가 Intro를 요청한 뒤 제안 준비나 후보자 응답을 기다리는 상태예요. 카드에서 제안 준비 중, 후보자 답변 대기, 후보자 수락 · 연결 준비 중을 구분해 볼 수 있어요. 요청을 했다는 사실만으로 전달이나 수락을 확정하지 않아요. 답변이 없으면 수락도 거절도 아니며, 추가 연락은 제안이 실제 전달된 뒤 부탁할 수 있어요. 수락 전에는 면접 조율이나 일반 Pipeline 이동을 진행하지 않아요. 후보자가 수락하면 추가 회사 승인 없이 소개 이메일로 연결하고, 거절하면 제안을 종료해 회사에 알려요.",
    tags: ["locale:ko", "topic:intro-awaiting"],
  },
  {
    key: "connection-access",
    category: "슬롯과 비용",
    question:
      "슬롯 없이도 후보자 추천과 연결 수락할 후보를 이용할 수 있나요?",
    answer:
      "네. 슬롯이 없는 Free Role도 Harper가 후보자에게 먼저 역할을 소개하고 관심을 확인하며, 연결 수락할 후보에서 수락한 후보자를 검토할 수 있어요. Intro 요청과 연결 수락에는 공용 Intro를 사용할 수 있어요. 유료 슬롯은 활성 Role 1개와 배정한 Role의 월 50 Intro를 추가해요.",
    tags: ["locale:ko", "topic:connection-access"],
  },
  {
    key: "slots-and-credits",
    category: "슬롯과 비용",
    question: "Free 공용 Intro와 슬롯 Intro는 어떻게 다른가요?",
    answer:
      "Free와 표준 슬롯 이용 회사에는 전체 Role이 함께 쓰는 월 3개의 공용 Intro가 있어요. 슬롯 하나는 배정한 Role에 월 50개의 슬롯 Intro를 추가로 제공해요. 공용 Intro는 특정 Role에 배정하는 무료 슬롯이 아니고, Role 생성 수나 채용 인원 수의 한도도 아니에요. Intro는 월 단위로 갱신되며 남은 Intro는 다음 기간으로 이월되지 않아요. 실제 잔액·갱신일과 기존 계약의 예외는 회사에 적용된 정보로 확인해야 해요.",
    tags: ["locale:ko", "topic:slots-and-credits"],
  },
  {
    key: "credit-spending",
    category: "슬롯과 비용",
    question: "Intro는 언제 차감되나요? 슬롯 Intro가 없으면 어떻게 되나요?",
    answer:
      "표준 요금에서는 회사가 Intro 요청을 확정하거나 연결 수락할 후보의 연결 수락을 실행할 때 1 Intro를 사용해요. 해당 Role의 슬롯 Intro를 먼저 쓰고 부족하면 공용 Intro를 사용해요. 다른 Role 슬롯의 Intro를 가져오지는 않아요. 검색 요청·Role 생성·Pass·연결 거절에는 Intro를 쓰지 않아요. 사용 가능한 Intro가 모두 없으면 해당 요청을 완료할 수 없어요. Intro 잔액과 별개로 초안은 제한 없이 만들 수 있고, 채용 시작·재개는 활성 Free Role 1개와 유효한 유료 슬롯의 범위 안에서 가능해요. 기존 별도 계약은 해당 조건을 따라요. 실제 차단 시 화면이나 Slack에 표시되는 안내를 확인하고 Harper 팀에 문의해 주세요.",
    tags: ["locale:ko", "topic:credit-spending"],
  },
  {
    key: "slot-management",
    category: "슬롯과 비용",
    question:
      "슬롯을 다른 Role에 배정하거나 구독을 취소하면 Role도 중단되나요?",
    answer:
      "결제 기능이 제공되는 Workspace의 Slots에서 슬롯 배정을 관리해요. 구독 취소는 해당 슬롯 단위로 처리하며, 사용 종료 시점은 화면의 구독 정보에서 확인해야 해요. 슬롯이 만료되면 남은 유효 슬롯에 배정할 수 있지만, 이미 활성화된 Role을 개수 초과로 자동 중지하지 않아요. 기존 활성 Free Role이 여러 개여도 유지되며, 새로 시작하거나 재개할 때만 Free Role 1개와 유효한 유료 슬롯의 용량을 확인해요. 기존 후보자·Intro·진행 이력은 유지하며, 별도 계약은 해당 조건을 따라요. 슬롯을 옮기면 각 Role이 사용할 수 있는 슬롯 Intro가 달라져요. 현재 일반 회사의 셀프서비스 결제는 일시 중단되어 있어 메뉴가 없으면 Harper 팀에 문의해야 해요.",
    tags: ["locale:ko", "topic:slot-management"],
  },
  {
    key: "role-public-promotion",
    category: "시작과 역할",
    question: "외부 공고 노출과 회사명 비공개를 설정하면 무엇이 바뀌나요?",
    answer:
      "Role Settings의 외부 공고 노출을 켜면 Harper가 LinkedIn 등 외부에 역할을 소개할 수 있어요. 켰다는 사실만으로 공고가 즉시 게시됐다는 뜻은 아니에요. 회사명 공개 여부에서 회사명을 비공개로 설정할 수 있지만 기존에 게시된 외부 공고는 이 설정 변경만으로 자동 수정되지 않아요. 공개 Description에 회사가 드러나는 표현이 있으면 내용도 함께 확인해 주세요. 외부 노출을 꺼도 내부 역할을 삭제하거나 채용 자체를 중단하는 것은 아니에요.",
    tags: ["locale:ko", "topic:role-public-promotion"],
  },
  {
    key: "workspace-language",
    category: "팀과 연동",
    question: "웹과 Slack의 Harper 언어를 바꿀 수 있나요?",
    answer:
      "회사 화면의 언어 설정은 회사 공용 언어예요. Owner와 조직 전체 Admin이 변경할 수 있고, 이후 생성되는 후보별 기준 설명·Harper Note·추천 이유와 자동 결과 안내·공지는 이 설정을 따라요. 설정이 없으면 본사 위치를 기준으로 정해요. 개인 설정의 언어는 화면과 직접 시작한 웹·Slack 대화에 적용돼요. 이미 저장된 설명·채팅·Role 문서나 후보자 연락은 자동으로 번역되지 않아요.",
    tags: ["locale:ko", "topic:workspace-language"],
  },
  {
    key: "contact-drafts",
    category: "후보자 소통과 전형",
    question: "연락 초안을 수정하거나 승인하면 언제 보내나요?",
    answer:
      "초안을 만들거나 수정하는 동안에는 후보자에게 발송하지 않아요. 표시된 최종 문구를 확인해 발송을 승인하면 일반적으로 짧은 대기 시간 뒤 전달하며, 지금 보내 달라고 명확히 요청하면 바로 전달할 수 있어요. 대기 중인 연락은 취소 가능한 상태에서만 취소할 수 있고 이미 전달된 연락은 회수되지 않아요. 승인 전에 내용을 바꿨다면 수정한 최신 초안을 확인해야 해요. 명확한 일상적인 연락은 별도 초안 검토 없이 전달할 수도 있어요.",
    tags: ["locale:ko", "topic:contact-drafts"],
  },
];
