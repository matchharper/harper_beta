export const ko = {
  auth: {
    login: "로그인",
    signup: "회원가입",
    continueWithGoogle: "Google로 계속하기",
    confirmPassword: "비밀번호 확인",
    emailConfirmationSent: "인증 메일을 발송했습니다. 이메일을 확인해주세요.",
    invalidAccount: "존재하지 않는 계정입니다.",
  },
  invitation: {
    title: "코드를 입력해주세요.",
    description:
      "하퍼는 현재 비공개 베타 중입니다. 초대 코드를 입력해주세요.\n초대코드가 필요하신분은 대기자 명단에 등록해주세요.",
    placeholder: "초대 코드",
    submit: "입력하기",
    divider: "또는",
    waitlist: "사전 등록하기",
    contact: "문의하기",
    errors: {
      emptyCode: "초대 코드를 입력해주세요.",
      invalidCode: "초대 코드가 일치하지 않습니다.",
    },
  },
  join: {
    roles: {
      recruiter: "전문 Recruiter",
      options: [
        "전문 Recruiter",
        "CEO",
        "채용 담당자",
        "CTO",
        "인사팀 매니저",
        "Team Lead",
        "Engineer",
        "기타",
      ],
    },
    sizes: ["1-10명", "11-50명", "51-100명", "101-200명", "201-500명", "501 이상"],
    steps: {
      contact: {
        title: "성함과 연락받으실 이메일 주소를 알려주세요.",
        description: "",
      },
      role: {
        title: "회사에서 어떤 역할을 담당하고 계시나요?",
        description: "",
      },
      company: {
        title: "회사명과 홈페이지를 알려주세요.",
        description: "(홈페이지는 선택사항입니다.)",
      },
      companyRecruiter: {
        title: "소속/에이전시명과 홈페이지를 알려주세요.",
        description: "(홈페이지는 선택사항입니다.)",
      },
      size: {
        title: "회사의 규모 (총 직원 수)는 어떻게 되나요?",
        description: "",
      },
      needs: {
        title: "가장 중요하게 채용이 필요한 포지션(직무)과 대략적인 인원수를 알려주세요.",
        description: "optional",
      },
      additional: {
        title:
          "하퍼에게 추가로 전달하고 싶은 내용이나, 현재 채용에 대한 고민이 있다면 자유롭게 적어주세요.",
        description: "optional",
      },
      additionalRecruiter: {
        title:
          "하퍼에게 추가로 전달하고 싶은 내용이나, 가장 해결되었으면 하는 니즈가 있다면 자유롭게 적어주세요.",
        description: "optional",
      },
    },
    fields: {
      nameLabel: "이름",
      namePlaceholder: "이름",
      emailLabel: "이메일",
      emailPlaceholder: "example@company.com",
      companyLabel: "회사명",
      companyPlaceholder: "예) Harper",
      companyLinkLabel: "홈페이지 URL",
      companyLinkPlaceholder: "예) https://matchharper.com",
      needsPlaceholder: "예) Machine Learning 엔지니어 2명, Deep Learning 연구원 1명",
      additionalPlaceholder:
        "예) 현재 채용이 급한데, 어떤 기준으로 후보를 보면 좋을지 고민입니다.",
    },
    actions: {
      submit: "제출하기",
      next: "다음",
      back: "이전",
      press: "press",
      enter: "Enter",
      saving: "저장중...",
    },
    done: {
      title: "등록이 완료되었습니다.",
      description:
        "Harper는 여러분의 팀에 가장 적합한 지원자를 소개하기 위해 준비 중입니다.\n빠른 시일 내 연락드리겠습니다.",
      backToCompanies: "돌아가기",
    },
    validation: {
      nameRequired: "이름을 입력해주세요.",
      emailRequired: "이메일을 입력해주세요.",
      emailInvalid: "유효한 이메일을 입력해주세요.",
      companyRequired: "회사명을 입력해주세요.",
      sizeRequired: "회사 규모를 선택해주세요.",
    },
  },
  companyLanding: {
    nav: {
      intro: "소개",
      howItWorks: "작동 방식",
      pricing: "가격 정책",
      faq: "FAQ",
    },
    dropdown: {
      joinWaitlist: "대기 명단",
      forCompanies: "기업용",
      referral: "추천",
    },
    startButton: "시작하기",
    hero: {
      badge: "Hiring Intelligence",
      titleLine1: "Don\u2019t Buy",
      titleLine2Prefix: "Pay for",
      titleLine2Highlight: "Intelligence",
      subtitle: "단순한 검색을 넘어, 인재를 이해하는 지능을 경험하세요.<br />하퍼는 매일, 후보자를 추천해주고 끊임없이 개선됩니다.",
    },
    section1: {
      title: "Recruiting Agent, Harper",
      headlineLine1: "",
      headlineLine2: "",
      bodyLine1: "채용은 회사의 미래를 결정하는 가장 중요한 의사결정입니다.",
      bodyLine2: "하퍼는 10배 더 빠르고, 10배 더 저렴한 전담 AI Recruiter입니다.",
    },
    why: {
      title: "Why harper?",
      cards: [
        {
          title: "Beyond Keywords",
          desc:
            "단순한 키워드 검색을 넘어, <br />역량과 맥락을 이해하고 찾아주는 지능을 경험하세요.",
        },
        {
          title: "Focus on Value",
          desc:
            "불필요한 정보를 걸러내는 시간은 <br/>저희에게 맡기세요. 꼭 필요한<br />인재만 보여드립니다.",
        },
        {
          title: "Intelligence on Top of Data",
          desc:
            "데이터만 제공하는게 아니라 흩어진 linkedin, github, scholar, twitter, blog 등 정보를 하나로 모아 분석하고<br />인사이트를 추출해 알려줍니다.",
        },
      ],
    },
    feature: {
      title: "How it works.",
      rows: [
        {
          label: "People Search",
          title: "동료에게 설명하듯,<br />편안하게 말씀해 주세요.",
          desc:
            "정확한 직무명을 모르셔도 괜찮습니다.<br />원하시는 인재에 대해 풀어서 알려주시면<br />해당하는 사람을 찾아드립니다.",
        },
        {
          label: "People Intelligence",
          title: "모든 정보를 바탕으로,<br />후보자에 대한 이해를 돕습니다.",
          desc:
            "후보자에 대한 퍼져있는 정보들을 모으고<br/>이를 바탕으로 질문에 대답해<br />인터뷰 전에 이미 후보자와 대화를 나눈 듯한 경험을 드립니다.",
          // "어떤 관심사를 가지고 커리어를 쌓아왔는지, <br />꾸준함과 열정은 어느 정도인지... <br />이력서의 빈 공간을 채워주는 풍부한 배경 정보를 제공합니다. <br />인터뷰 전에 이미 후보자와 깊은 대화를 나눈 듯한 경험을 드립니다",
        },
        {
          label: "Harper Scout",
          title: "매일 후보자를 찾아<br />추천해드립니다.",
          desc:
            "원하는 인재상을 자유롭게 등록하면 매일 적절한 후보자를 추천해드립니다.<br />피드백을 바탕으로 추천 결과가 점점 더 개선됩니다.",
        }
      ],
    },
    testimonial: {
      body:
        "하퍼는 단순한 검색 필터 서비스가 아닙니다.<br />AI Agent가 수많은 웹 정보, 글, 기록을 종합해<br />이력서에 없는 맥락까지 읽고, 사람처럼 추론하고 판단하며<br />조직이 원하는 인재를 직접 탐색할 수 있게 합니다.",
      name: "Chris & Daniel",
      role: "Co-founder",
    },
    faq: {
      title: "Questions & Answers",
      items: [
        {
          question:
            "지금 바로 가입해서 사용할 수 없나요? (초대 코드는 어떻게 받나요?)",
          answer:
            "현재 Harper는 데이터 품질과 AI 리소스 최적화를 위해 엄선된 소수의 테크 기업을 대상으로 Private Beta를 운영 중입니다. 올해 2분기(Q2) 정식 출시를 목표로 하고 있으며, 대기명단에 등록해 주시면 온보딩을 통해 초대 코드를 발송해 드립니다.",
        },
        {
          question: "AI가 분석한 데이터를 신뢰할 수 있나요?",
          answer:
            "네, 신뢰할 수 있습니다. Harper의 AI는 추측하지 않고 증명합니다. LinkedIn, Google Scholar, GitHub, 블로그등 웹상에 실존하는 '검증 가능한 데이터'만을 기반으로 분석하기 때문입니다. 또한, AI가 도출한 모든 인사이트에는 원본 출처가 함께 제공되므로 직접 팩트 체크가 가능합니다.",
        },
        {
          question:
            "'키워드 검색'과 Harper의 '시맨틱 서치'는 무엇이 다른가요?",
          answer:
            "'Python 개발자'를 검색하는 것과, '대규모 트래픽 처리를 경험해 본 Python 백엔드 리드'를 찾는 것은 다릅니다. Harper는 단순 키워드 매칭이 아니라, 채용 담당자가 말하는 맥락과 의도를 이해하여 기술적 난제를 해결할 수 있는 최적의 후보자를 찾아냅니다.",
        },
        {
          question: "어떤 직군의 인재를 찾을 수 있나요?",
          answer:
            "Harper의 AI 엔진은 AI 리서처(AI Researcher)와 머신러닝 엔지니어(ML Engineer) 같은 고난이도 테크 인재 발굴에 가장 특화되어 있습니다.\n하지만 이에 국한되지 않고, 현재 PM(Product Manager) 및 PD(Product Designer) 등 테크 조직 내 핵심 직군에 대해서도 유의미한 검색과 프로파일링 기능을 이미 지원하고 있습니다.",
        },
      ],
    },
    closing: {
      title: "Meet your AI recruiter.",
      headlineLine1: "Harper와 함께,",
      headlineLine2: "채용을 즐거운 발견으로.",
    },
    footer: {
      contact: "Contact Us",
    },
    pricing: {
      title: "팀의 성장에 맞는 합리적인 플랜",
      subtitle: "비즈니스 성장에 필요한 모든 기능을 제공합니다.",
      contactLabel: "별도 문의",
      billing: {
        monthly: "월간 결제",
        yearly: "연간 결제",
        discountLabel: "20% 할인",
      },
      plans: {
        pro: {
          name: "Pro",
          tagline: "소수 정예 팀이 지금 필요한 1~2명을 찾는 데 최적화",
          priceUnit: "원/월",
          buttonLabel: "문의하기",
          features: [
            "월 150 Credits<br />(10명 검색당 1 credit)",
            "정보 수집 및 인재 분석<br />(후보자 1명에 대한 딥리서치)",
            "AI 스마트 서치",
            "무제한 채팅",
          ],
        },
        max: {
          name: "Max",
          tagline: "공격적인 소싱과 빠른 조직 확장이 필요한 플랜",
          priceUnit: "원/월",
          buttonLabel: "문의하기",
          features: [
            "Pro의 모든 기능 포함, 및:",
            "월 350 Credits",
            "동시 검색 기능",
            "AI 소싱 에이전트",
          ],
        },
        enterprise: {
          name: "Enterprise",
          tagline: "무제한 데이터 접근 권한과 커스텀 연동을 위한 전용 플랜",
          priceUnit: "",
          buttonLabel: "문의하기",
          features: [
            "Max의 모든 기능 포함, 및:",
            "Credits 무제한",
            "온보딩 및 교육 지원",
            "팀 협업 및 관리 시트",
            "전담 고객 지원",
          ],
        },
      },
    },
  },
  help: {
    title: "Help",
    intro:
      "무엇이든지 궁금하거나 필요하신게 있다면, 아래의 이메일로 연락해주세요.",
    emailCopied: "이메일이 클립보드에 복사되었습니다.",
    prompt:
      "혹은 추가되었으면 하는 인재풀이나 원하는 결과가 나오지 않는 검색이 있으신가요?",
    submit: "보내기",
    submitted: "피드백이 제출되었습니다.",
  },
  loading: {
    making_criteria: "검색 기준을 세우고 있습니다...",
    making_query: "해당하는 사람을 찾을 방법을 설계하고 있습니다...",
    searching_candidates: "전체 인재를 탐색하여 후보자를 찾는 중입니다...",
    searching_again: "문제가 발생하여 검색을 한번 더 시도하고 있습니다...",
    retrying_error: "검색 과정에서 문제가 발생하여 해결하고 있습니다...",
    expanding_search: "검색 조건을 좀 더 늘려서 검색을 시도하고 있습니다...",
    summarizing: "각 후보자의 정보를 확인하고 적합성을 판단하고 있습니다...",
    return: "결과를 획득했습니다. 정리하고 반환합니다.",
    start: "검색을 시작합니다...",
    processing: "처리 중...",
  },
  system: {
    history: "기록",
    logout: "로그아웃",
    account: "계정 관리",
    deleta: "삭제",
    activity: "저장",
    requests: "연결 요청됨",
    connections: "연결",
    loadmore: "더 불러오기",
    message: "내용",
    close: "닫기",
    hello: "안녕하세요",
    intro: "어떤 인재를 찾고 계신가요?",
    credits: "Billing",
    credit_history: "크레딧 요청 내역",
    no_credit_request: "크레딧 요청 내역이 없습니다.",
    processing: "처리 중...",
    done: "완료",
    pending: "대기",
    credit_request: "추가 크레딧 요청",
    close_sidebar: "사이드바 닫기",
    open_sidebar: "사이드바 열기",
    search: "검색",
    submit_request: "제출하기",
    credit_request_submitted: "요청이 성공적으로 접수되었습니다.",
    credit_request_submitted_description:
      "신청해 주셔서 감사합니다. 현재 크레딧 증액 요청을 검토 중이며, 곧 결과가 안내될 예정입니다. 알림 수신에 동의하신 경우, 진행 상황을 이메일로 받아보실 수 있습니다.",
  },
  home: {
    queryPlaceholder: "국내 대학을 졸업하고 미국 M7에서 AI/ML 경험 있는 사람",
    examples: [
      {
        label: "엔지니어",
        query:
          "국내 과학고 졸업 후 서울대 / KAIST에 진학하여 미국 M7에서 AI / Machine Learning 경험 2년 이하 보유한 사람",
      },
      {
        label: "프로덕트 매니저",
        query: "네카라쿠배 출신 프로덕트 매니저 + 개발 역량 보유",
      },
      {
        label: "리서처",
        query:
          "CVPR / NeurIPS 논문 경험이 있고 Vision Embedding 또는 멀티모달(VLM) 연구를 잘하는 석사 졸업 이상 AI 리서처 (교수 제외)",
      },
    ],
  },
  chat: {
    composerPlaceholder: "무엇이든 질문하세요 (Enter 전송 / Shift+Enter 줄바꿈)",
    candidSuggestions: [
      "이 사람이 이직 의사가 있을까?",
      "이 사람이 우리 팀에 적합한지, 근거와 함께 평가해줘.",
      "처음 대화를 할 때, 어떤 주제로 시작하면 좋을지 알려줘.",
    ],
    unlockProfileCta: "프로필 잠금 해제 후 대화를 시작할 수 있어요",
    loadingHistory: "대화 기록 불러오는 중...",
  },
  scout: {
    title: "Harper Scout",
    addAgent: "+ 에이전트 추가",
    intro:
      "Harper가 Agent로서 필요한 인재 역량, 팀 문화 등을 바탕으로 매일 후보자를 찾아 추천합니다.\n각 Agent당 매일 1~2명이 추천되며, 각 후보자당 1 크레딧이 소모됩니다.",
    emptyTag: "Harper Scout 시작하기",
    emptyTitle: "Harper Scout에 오신걸 환영합니다.",
    emptySubtitle: "아직 등록된 Agent가 없습니다",
    emptyDesc:
      "Harper와 대화하며 역할, 스택, 팀 문화 등을 알려주면 Harper가 매일 적합한 후보자를 찾아 추천합니다.",
    emptyDesc2: "첫 Agent를 만들고 바로 시작해보세요.",
    feedbackPrefix: "후보자에 대한",
    feedbackPositive: "관심있어요",
    feedbackNegative: "아쉬워요",
    feedbackSuffix: "피드백을 통해 결과가 점점 더 개선됩니다.",
    createAgent: "Agent 만들기",
    perAgentNote: "각 Agent당 추천은 하루 1~2명, 후보자당 1 크레딧이 소모됩니다.",
    statusRunning: "진행 중",
    statusStopped: "진행 정지",
    createdAt: "생성:",
    updatedAt: "최근 업데이트:",
    edit: "내용 수정",
    loadingList: "불러오는 중...",
    limitMessage: "자동화는 한번에 최대 2개까지 진행 가능합니다.",
    checkAutomationFail: "자동화 상태를 확인하지 못했습니다.",
    itemFallbackTitle: "Scout",
    initialAssistantMessage:
      "안녕하세요, Harper입니다.\n이번 채용에서 어떤 문제를 해결하고 싶은지부터 편하게 말씀해주세요.\n\n포지션, 팀 상황, 꼭 필요한 역량이 정리되지 않아도 괜찮습니다.\n대화를 통해 함께 구조화하고, 가장 적합한 후보를 찾아드릴게요.",
  },
  company: {
    information: "회사 정보",
    description: "설명",
    news: "관련 중요 기사",
    investors: "투자자",
    established: "설립 연도",
    hq: "본사",
  },
  search: {
    resultHeader: {
      by: "작성자",
      readingCandidates: "후보자들의 정보를 읽고 정합성을 확인하고 있습니다...",
      finished: "검색 완료",
    },
    resultBody: {
      emptyPrompt: "대화를 마친 뒤 “검색하기”를 누르면 결과가 여기에 표시됩니다.",
      page: "페이지 {page}",
      loadingSuffix: " (로딩 중...)",
      capped: "({cap} 페이지로 제한됨)",
      previous: "이전",
      next: "다음 10명 더 검색",
      credit: {
        withCredit: " (크레딧 1 소모)",
        noCredit: " (크레딧 소모 없음)",
      },
    },
    timeline: {
      headerTitle: "Harper가 후보를 찾는 중이에요",
      stopped: "검색 중지됨",
      stop: "중지",
      note: "* Max 플랜 사용자라면 동시에 여러 개의 검색을 실행할 수 있습니다.",
      // note2: "* 같은 기준으로 검색했을 때도 검색 결과는 ",
      steps: {
        parseTitle: "요청 이해",
        parseDesc: "기준을 해석하고 검색 전략을 구성합니다.",
        planTitle: "검색 전략 세우기",
        planDesc: "기준을 구체화하고 검색 범위를 정합니다.",
        refineTitle: "검색 방법 최적화",
        refineDesc: "쿼리/조건을 다듬어 성능과 정확도를 최적화합니다.",
        runningTitle: "전체 후보자 찾기",
        runningDesc: "경력/회사/키워드 기반으로 후보를 넓게 찾습니다.",
        rankingTitle: "랭킹/스코어링",
        rankingDesc: "기준에 맞게 우선순위를 계산합니다.",
        recoveryTitle: "조건 추가하기",
        recoveryDesc: "문제를 분석하고 안전한 방식으로 계속 진행합니다.",
        recoveryRetryTitle: "복구/재시도 경로 실행",
        recoveryRetryDesc: "조건을 완화하거나 다른 전략으로 재시도합니다.",
        retryTitle: "대체 전략으로 후보 재탐색",
        retryDesc: "타임아웃/실패 조건을 회피해 다시 후보를 찾습니다.",
      },
    },
    status: {
      parsing: "parsing: 해당하는 사람을 찾을 방법을 설계하고 있습니다...",
      refine: "refine: 검색 방법을 최적화하고 있습니다.",
      running: "running: 전체 인재를 탐색하여 후보자를 찾는 중입니다...",
      errorHandling:
        "error_handling: 검색 과정에서 문제가 발생하여 해결하고 있습니다...",
      errorHandlingWithCount:
        "error_handling: {count}명의 후보자를 찾았습니다. 더 많은 후보자를 찾기 위해 검색 조건을 확장하겠습니다.",
      expanding:
        "expanding: 더 많은 후보자를 찾기 위해 검색 범위를 넓혀서 검색을 시도하겠습니다...",
      expandingWithCount:
        "expanding: {count}명의 후보자를 찾았습니다. 더 많은 후보자를 찾기 위해 검색 범위를 넓혀서 검색을 시도하겠습니다...",
      ranking: "reranking: 각 후보자의 정보를 확인하고 적합성을 판단하고 있습니다...",
    },
    defaultMessage: {
      intro:
        "전체 중 이번 검색에서는 후보 {total}명을 먼저 검토해 기준 충족 여부를 확인했습니다.",
      full: "그 중 {full}명이 모든 기준을 만족했고, ",
      partial: "{partial}명이 일부 기준을 만족했습니다.",
    },
    ui: {
      searchResult: "검색 결과 {full}/{total}",
    },
    completionPrompt: {
      outputLanguage: "Korean",
    },
  },
  data: {
    currentExperience: "현재",
    experience: "경력 사항",
    education: "학력",
    present: "현재",
    save: "저장",
    saved: "저장됨",
    totalexp: "총 경력",
    publications: "저술 및 발표",
    summary: "한줄 설명",
    request: "연결 요청",
    request_cancel: "연결 요청 취소",
    generating: "후보자를 파악하는 중입니다...",
  },
} as const;
