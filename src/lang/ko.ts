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
    title: "Request access",
    description:
      "아래 정보를 남겨주시면 사용 권한을 최대한 빠르게\n로그인하신 이메일로 보내드리겠습니다.",
    nameTitle: "이름을 입력해주세요.",
    nameDescription:
      "초대 코드가 확인되었습니다. 사용자분의 이름을 입력해주세요.",
    namePlaceholder: "이름",
    placeholder: "초대 코드",
    nameSubmit: "저장하기",
    submit: "입력하기",
    divider: "또는",
    waitlist: "Request access",
    contact: "문의하기",
    requestAccess: {
      title: "Request access",
      description:
        "팀과 채용 상황을 간단히 알려주세요. 승인되면 로그인한 이메일로 접근 링크를 보내드리겠습니다.",
      submit: "액세스 받기",
      submitted:
        "액세스 요청이 접수되었습니다. 승인되면 5분안에 이메일로 링크를 보내드리겠습니다.",
      nameLabel: "이름",
      namePlaceholder: "이름을 입력해주세요",
      companyLabel: "회사명",
      companyPlaceholder: "회사명을 입력해주세요",
      roleLabel: "역할 (optional)",
      rolePlaceholder: "예: Founder, Hiring Manager",
      hiringNeedLabel:
        "가장 중요하게 채용이 필요한 포지션(직무)과 대략적인 인원수",
      hiringNeedPlaceholder: "예: Backend Engineer 2명, Founding Recruiter 1명",
      errors: {
        missingSession:
          "로그인 상태를 확인할 수 없습니다. 다시 로그인해주세요.",
        invalidForm: "이름과 회사명을 입력해주세요.",
        submitFailed: "요청 접수에 실패했습니다. 다시 시도해주세요.",
      },
    },
    errors: {
      emptyCode: "초대 코드를 입력해주세요.",
      invalidCode: "초대 코드가 일치하지 않습니다.",
      domainMismatch:
        "가입한 이메일의 도메인이 초대 코드에 지정된 회사 도메인과 일치하지 않습니다.",
      emptyName: "이름을 입력해주세요.",
      saveNameFailed: "이름 저장에 실패했습니다. 다시 시도해주세요.",
    },
  },
  join: {
    roles: {
      recruiter: "전문 Recruiter",
      other: "기타",
      options: [
        "전문 Recruiter",
        "CEO / Founder",
        "Co-Founder",
        "채용 담당자",
        "Team Lead",
        "Engineer",
        "VC",
        "기타",
      ],
    },
    sizes: [
      "1-10명",
      "11-50명",
      "51-100명",
      "101-200명",
      "201-500명",
      "501 이상",
    ],
    steps: {
      contact: {
        title: "성함과 연락받으실 이메일 주소를 알려주세요.",
        description: "작성에는 1분 이하의 시간이 소요됩니다.",
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
        title:
          "가장 중요하게 채용이 필요한 포지션(직무)과 대략적인 인원수를 알려주세요.",
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
      roleOtherPlaceholder: "직접 입력해 주세요",
      needsPlaceholder:
        "예) Machine Learning 엔지니어 2명, Deep Learning 연구원 1명",
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
        "Harper는 스타트업이 최고의 인재를 찾을 수 있게 하기 위해 준비 중입니다.\n빠른 시일 내 연락드리겠습니다.",
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
      blog: "블로그",
    },
    dropdown: {
      intro: "소개",
      howItWorks: "작동 방식",
      pricing: "가격 정책",
      faq: "FAQ",
      blog: "블로그",
    },
    startButton: "시작하기",
    hero: {
      badge: "Hiring Intelligence",
      titleLine1: "Don\u2019t Buy",
      titleLine2Prefix: "Pay for",
      titleLine2Highlight: "Intelligence",
      subtitle:
        "어떤 조건이던 AI 검색 엔진이<br />GitHub, 논문 등 모든 정보를 바탕으로<br />원하는 프로필을 가진 사람을 즉시 찾아드려요.",
    },
    section1: {
      title: "Faster, Cheaper, Better",
      headlineLine1: "사람을 찾는데 사용하던",
      headlineLine2: "수십 시간을, 몇분으로 줄여드립니다.",
      bodyLine1: "",
      bodyLine2:
        "Harper가 역량과 맥락을 먼저 읽고 정리해, 검토 시간을 크게 단축합니다.",
      // "It shrinks weeks of work that a whole recruiting team would do, into days."
    },
    why: {
      title: "Why harper?",
      sub: "",
      cards: [
        {
          title: "Beyond Keywords",
          desc: "단순한 키워드 검색을 넘어, <br />기술적 역량과 맥락을 이해하고<br/>기준을 충족하는지 판단해 알려드립니다.",
        },
        {
          title: "Focus on Value",
          desc: "불필요한 정보를 걸러내는 시간은 <br/>저희에게 맡기세요. 꼭 필요한<br />인재만 보여드립니다.",
        },
        {
          title: "Intelligence on Top of Data",
          desc: "데이터만 제공하는게 아니라 흩어진 linkedin, github, scholar, twitter, blog 등 정보를 하나로 모아 분석하고<br />인사이트를 추출해 알려줍니다.",
        },
      ],
    },
    feature: {
      title: "How it works.",
      rows: [
        {
          label: "People Search",
          title: "동료에게 설명하듯,<br />편안하게 말씀해 주세요.",
          desc: "정확한 직무명을 모르셔도 괜찮습니다.<br />원하시는 인재에 대해 풀어서 알려주시면<br />해당하는 사람을 찾아드립니다.",
        },
        {
          label: "People Intelligence",
          title: "모든 정보를 바탕으로,<br />후보자에 대한 이해를 돕습니다.",
          desc: "후보자에 대한 퍼져있는 정보들을 모으고<br/>이를 바탕으로 질문에 대답해<br />인터뷰 전에 이미 후보자와 대화를 나눈 듯한 경험을 드립니다.",
          // "어떤 관심사를 가지고 커리어를 쌓아왔는지, <br />꾸준함과 열정은 어느 정도인지... <br />이력서의 빈 공간을 채워주는 풍부한 배경 정보를 제공합니다. <br />인터뷰 전에 이미 후보자와 깊은 대화를 나눈 듯한 경험을 드립니다",
        },
      ],
    },
    testimonial: {
      body: "하퍼는 단순한 검색 필터 서비스가 아닙니다.<br />AI Agent가 수많은 웹 정보, 글, 기록을 종합해<br />이력서에 없는 맥락까지 읽고, 사람처럼 추론하고 판단하며<br />최고의 인재를 연결해드립니다.",
      name: "Chris & Daniel",
      role: "Co-founder",
    },
    faq: {
      title: "Questions & Answers",
      items: [
        {
          question: "지금 바로 사용할 수 있나요?",
          answer:
            "로그인 하신 뒤 Access 요청 버튼을 눌러주시면 접근 권한을 열어드리고 있습니다. 평균적으로 10분 안에 바로 권한을 드리니, 부담없이 요청해 주세요.",
        },
        {
          question: "'키워드 검색'과 Harper의 'AI 검색'은 무엇이 다른가요?",
          answer:
            "'백엔드 개발자'를 검색하는 것과, '글로벌 스케일로 대규모 트래픽 처리를 경험해 본 백엔드 리드'를 찾는 것은 다릅니다. Harper는 단순 키워드 매칭과 필터가 아니라, 맥락과 의도를 이해하여 기술적 난제를 해결할 수 있는 최적의 후보자를 찾아냅니다.",
        },
        {
          question: "어떤 직군의 인재를 찾을 수 있나요?",
          answer:
            "Harper의 엔진은 링크드인 뿐만 아니라 여러 technical source를 검색에 활용하기 때문에 리서처와 머신러닝 엔지니어 같은 고난이도 테크 인재 발굴에 가장 특화되어 있습니다.\n하지만 이에 국한되지 않고, 현재 PM 및 PD, 마케터 등 테크 조직 내 핵심 직군에 대해서도 발견이 가능합니다. 다양한 직군을 포함해 총 40만+개의 프로필을 가지고 있으며, 여기 포함된 직군은 찾을 수 있습니다. 검색 자체는 제한없이 무료로 사용할 수 있으며, 매달 기본 프로필 열람 횟수가 제공되니 편하게 직접 원하는 사람이 나오는지 테스트해보세요.",
        },
        {
          question: "어떤 정보를 제공하나요?",
          answer:
            "Harper는 공개적으로 접근 가능한 전문 정보(예: 공개 프로필, 오픈소스 기여 기록, 학술 발표, 블로그 등)를 분석하여 구조화합니다.\nHarper는 휴대폰, 이메일, 개인 정보를 다운로드 가능한 형태로 제공하지 않고, 공개된 데이터에 기반한 검색 및 매칭 기능을 제공합니다.",
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
      title: "Pricing",
      subtitle: "우선 무료로 시작하고 결정하세요.",
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
          priceUnit2: "/월",
          buttonLabel: "이용하기",
          features: [
            "무제한 AI 검색 및 랭킹",
            "월 50회 프로필 열람",
            "논문 및 코드 품질 분석",
          ],
        },
        max: {
          name: "Max",
          tagline: "공격적인 소싱과 빠른 조직 확장이 필요한 플랜",
          priceUnit: "원/월",
          priceUnit2: "/월",
          buttonLabel: "이용하기",
          features: [
            "Pro의 모든 기능 포함, 및:",
            "월 120회 프로필 열람",
            "동시에 최대 3개의 검색 실행",
            "AI 소싱 에이전트<br /><i>An autonomous co-pilot that proactively</i>",
          ],
        },
        enterprise: {
          name: "Enterprise",
          tagline: "무제한 데이터 접근 권한과 커스텀 연동을 위한 전용 플랜",
          priceUnit: "",
          priceUnit2: "",
          buttonLabel: "문의하기",
          features: [
            "Max의 모든 기능 포함, 및:",
            "맞춤형 열람 횟수 설계",
            "온보딩 및 교육 지원",
            "팀 협업 및 관리 시트",
            "전담 고객 지원",
          ],
        },
      },
    },
    pricingFaq: {
      title: "결제 / 이용 한도 FAQ",
      items: [
        {
          question: "무료로도 사용이 가능한가요?",
          answer:
            "네. 무료로도 Free 플랜을 사용할 수 있습니다. Free는 매달 5회까지 프로필을 열람할 수 있습니다.",
        },
        {
          question: "언제든지 구독을 취소할 수 있나요?",
          answer:
            "네. 원하시면 언제든지 구독을 취소할 수 있습니다. 구독 취소 후에도 현재 결제 주기 종료 전까지는 기존 플랜의 남은 열람 횟수를 그대로 이용할 수 있으며, 이후에는 Free 플랜 기준으로 전환됩니다.",
        },
        {
          question: "열람 횟수는 언제 차감되나요?",
          answer:
            "검색과 페이지 이동은 모두 무료입니다. 후보자 프로필을 실제로 열람할 때만 열람 횟수가 1회 차감되며, 한 번 열람한 프로필은 이후 계속 확인할 수 있습니다.",
        },
        {
          question: "월 열람 횟수는 어떻게 계산되나요?",
          answer:
            "결제 시점, 즉 새로운 플랜이 시작되는 시점을 기준으로 1개월 단위로 계산됩니다.",
        },
        {
          question: "영수증이나 세무 증빙 문서를 받을 수 있나요?",
          answer:
            "결제가 완료되면 영수증이 발행됩니다. 별도 증빙 문서가 필요하면 문의하기를 통해 요청해 주세요.",
        },
        {
          question: "부분 환불이 가능한가요?",
          answer:
            "월간 구독의 경우 기본적으로 부분 환불은 제공되지 않습니다.\n \
다만 정당한 사유가 있는 경우 고객센터로 문의해 주시면 개별적으로 검토해 드립니다. 이 경우 결제하신 플랜과 남은 이용 기간을 기준으로 환불 금액이 산정될 수 있습니다.\n\n \
연간 구독의 경우, 구독 기간 중 취소 및 환불을 요청하시면 이미 사용한 개월 수를 월간 구독 요금 기준으로 계산한 후, 나머지 기간에 해당하는 금액을 환불해 드립니다.\n자세한 사항은 아래의 환불 규정을 확인해주세요.",
        },
      ],
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
    credits: "이용 현황",
    processing: "처리 중...",
    done: "완료",
    pending: "대기",
    close_sidebar: "사이드바 닫기",
    open_sidebar: "사이드바 열기",
    search: "검색",
    submit_request: "제출하기",
  },
  home: {
    queryPlaceholder: "국내 대학을 졸업하고 미국 M7에서 AI/ML 경험 있는 사람",
    queryPlaceholders: [
      "국내 대학을 졸업하고 미국 M7에서 AI/ML 경험 있는 사람",
      "네카라쿠배 출신 프로덕트 매니저 + 개발 역량 보유",
      "CVPR / NeurIPS 논문 경험이 있는 비전·멀티모달 AI 리서처",
      "Series A~C 스타트업에서 0→1 제품 출시를 이끈 백엔드 엔지니어",
      "영어 커뮤니케이션이 가능하고 해외 고객 온보딩 경험이 있는 B2B 세일즈",
    ],
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
      // {
      //   label: "질문",
      //   query: "어떤 기준으로 검색할 수 있나요?",
      // },
      {
        label: "리서처",
        query:
          "CVPR / NeurIPS 논문 경험이 있고 좋은 Vision Embedding 또는 멀티모달(VLM) 연구를 하는 석사 졸업 이상 AI 리서처 (교수 제외)",
      },
    ],
  },
  chat: {
    composerPlaceholder:
      "무엇이든 질문하세요 (Enter 전송 / Shift+Enter 줄바꿈)",
    attachFile: "파일 첨부",
    attachLink: "링크 입력",
    addLink: "링크 추가",
    linkPlaceholder: "https://example.com",
    invalidLink: "유효한 링크를 입력해주세요.",
    attachedFileLabel: "첨부 파일",
    attachedLinkLabel: "첨부 링크",
    fileReading: "파일을 읽는 중...",
    fileReadFail: "파일을 읽지 못했습니다. 다시 시도해주세요.",
    candidSuggestions: [
      "이 사람이 이직 의사가 있을까?",
      "이 사람이 우리 팀에 적합한지, 근거와 함께 평가해줘.",
      "처음 대화를 할 때, 어떤 주제로 시작하면 좋을지 알려줘.",
    ],
    unlockProfileCta: "대화를 시작해 보세요",
    loadingHistory: "대화 기록 불러오는 중...",
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
      emptyPrompt:
        "대화를 마친 뒤 “검색하기”를 누르면 결과가 여기에 표시됩니다.",
      page: "페이지 {page}",
      loadingSuffix: " (로딩 중...)",
      capped: "({cap} 페이지로 제한됨)",
      previous: "이전",
      next: "다음 10명 더 보기",
      credit: {
        withCredit: "",
        noCredit: "",
      },
    },
    timeline: {
      headerTitle: "Harper가 후보를 찾는 중이에요",
      stopped: "검색 중지됨",
      stop: "중지",
      note: "* Max 플랜 사용자라면 동시에 여러 개의 검색을 실행할 수 있습니다.",
      note2:
        "* LLM의 특성상 같은 기준으로 검색했을 때도 검색 결과가 경우에 따라 달라질 수 있습니다.",
      note3:
        "* 사이트를 종료하거나 다른 화면으로 이동하셔도 검색은 계속 진행됩니다.",
      found:
        "조건을 만족하는 후보자 10명을 발견했습니다. (더 많은 후보자를 탐색 중입니다.)",
      steps: {
        parseTitle: "요청 이해",
        parseDesc: "기준을 해석하고 검색 전략을 구성합니다.",
        planTitle: "검색 전략 세우기",
        planDesc: "기준을 구체화하고 검색 범위를 정합니다.",
        refineTitle: "검색 방법 최적화",
        refineDesc: "쿼리/조건을 다듬어 성능과 정확도를 최적화합니다.",
        runningTitle: "전체 후보자 찾기",
        runningDesc: "경력/회사/키워드 기반으로 후보를 넓게 찾습니다.",
        partialTitle: "후보자 모으기",
        partialDesc: "범위를 확장해서 더 많은 후보자를 검토합니다.",
        rankingTitle: "랭킹/재정렬",
        rankingDesc: "기준에 적합한지 판단하고 우선순위를 계산합니다.",
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
      ranking:
        "reranking: 각 후보자의 정보를 확인하고 적합성을 판단하고 있습니다...",
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
  career: {
    "career.api.auth.email_onboarding_email_mismatch":
      "이메일 온보딩 링크의 이메일과 로그인 계정의 이메일이 일치하지 않습니다.",
    "career.api.auth.email_onboarding_link_invalid":
      "이메일 온보딩 링크가 만료되었거나 올바르지 않습니다. 랜딩페이지에서 다시 이메일을 남겨주세요.",
    "career.api.auth.network_invite_email_mismatch":
      "초대 메일과 동일한 Google 계정으로 로그인해 주세요.",
    "career.api.auth.network_invite_not_found": "초대 정보를 찾지 못했습니다.",
    "career.api.basic_info.email_invalid": "유효한 이메일을 입력해주세요.",
    "career.api.basic_info.name_required": "이름을 입력해주세요.",
    "career.api.chat.active_opportunity_search":
      "기회를 찾는 중입니다. 검색이 끝나면 바로 이어서 대화할 수 있습니다.",
    "career.api.profile.sources_missing_refresh":
      "다시 가져올 LinkedIn 링크나 이력서 텍스트가 없습니다.",
    "career.call.career_call_card.0ocs6vv": "통화 시작",
    "career.call.career_call_card.1vn8y3k": "연결 중...",
    "career.call.duration": "{m}분 {s}초",
    "career.call.environment_notice.collapse": "접기",
    "career.call.environment_notice.description":
      "주변 소음이 많으면 Harper가 말을 정확히 듣지 못해 통화가 매끄럽지 않을 수 있어요. 가능한 조용한 곳에서 이어주세요.",
    "career.call.environment_notice.heading":
      "주변이 시끄러우면 통화가 정확하지 않을 수 있어요.",
    "career.call.environment_notice.title": "통화 환경 안내",
    "career.call.internal_brief_followup":
      "{companyName} {roleTitle} 관련 통화가 조금 짧게 끝난 것 같아요. 연결은 계속 진행 중이고, 더 이야기하고 싶으시면 Home 화면의 통화 카드에서 이어서 진행해주세요.",
    "career.call.internal_completed_followup":
      "{companyName} {roleTitle} 관련해서 들려주신 내용은 회사 측에 전달할 때 잘 반영해둘게요. 연결은 계속 진행 중입니다.",
    "career.call.internal_interrupted_followup":
      "{companyName} {roleTitle} 관련 통화가 중간에 끊긴 것 같아요. 연결은 계속 진행 중이고, 이어서 이야기하고 싶으시면 채팅이 아니라 Home 화면의 통화 카드에서 다시 진행해주세요.",
    "career.call.internal_opportunity_call_actions.0fpx491": "회사",
    "career.call.internal_opportunity_call_actions.pending_call_label":
      "{companyName} - {roleTitle} 통화 대기",
    "career.call.opening.default_text":
      "통화로 이야기해볼게요. 최근에 달라진 우선순위가 있으면 거기서 시작해도 좋고, 아니면 지금까지의 역할이나 경험 중 회사들이 꼭 알아야 할 부분부터 편하게 들려주세요. 정보가 많을수록 더 잘 맞는 연결 요청이나 기회를 골라드릴 수 있어요.",
    "career.call.opening.instruction.conversation_starter":
      "\n## Conversation starter opening\n이번 통화는 사용자가 특정 conversation starter 버튼을 눌러 시작했습니다.\n아래 starter 내용의 목적과 질문 방향을 가장 우선하세요.\n최근 우선순위, 선호 조건, 일반적인 기회 탐색 질문을 임의로 고르지 마세요.",
    "career.call.opening.instruction.default":
      "통화가 방금 시작되었습니다. 사용자가 먼저 할 말을 찾지 않아도 되도록 Harper가 먼저 대화를 시작하세요.\n도구는 사용하지 마세요. 지금은 통화 시작 멘트와 첫 질문만 합니다.\n한국어 존댓말로, 실제 전화 첫마디처럼 자연스럽게 말하세요.\n2-4문장으로 짧게 말하고, 마지막은 사용자가 바로 답할 수 있는 하나의 질문으로 끝내세요.\n통화는 크게 2가지 방식으로 시작할 수 있습니다. 1) 이전에 채팅으로 진행하던 대화를 통화로 이어서하는 경우, 2) 통화로 새롭게 대화를 시작하는 경우\n최근 채팅 맥락이 함께 제공되면 먼저 그 내용을 보고, 이전에 채팅으로 진행하던 대화를 통화로 이어서 하는 상황인지 판단하세요.\n이전 내용에서 이어서 말하는 게 자연스러우면 새 주제를 꺼내지 말고 마지막으로 오가던 질문이나 답변을 직접 이어받아 시작하세요. 대신 인사하고 시작하는 것이 자연스러우면 인사하고 시작하면 된다.\n이어가기 위해 필요하면 직전 대화의 마지막 질문이나 확인점을 짧게 다시 물어도 됩니다.\n(2번) 새롭게 대화를 시작하는게 자연스러우면 먼저 커피챗을 시작하는 헤드헌터처럼 말을 건네면서 시작하면 된다.\n최근 대화나 활동 맥락이 보이면 구체적으로 연결하세요. 예를 들어 최근 연결 제안을 거절했거나 추천에 피드백을 남겼다면, 그 이후 달라진 점이 있는지 물어보세요.\n구체적 맥락이 약하면 최근에 달라진 우선순위, 현재 역할/경험 중 더 알려줄 부분, 개인적인 선호나 제약 중 하나를 물어보세요.\n많은 정보를 들려줄수록 회사 연결 요청이나 맞춤 기회 추천이 더 정확해진다는 취지를 한 번만 짧게 말하고, 함께 헤드헌터의 입장에서 할만한 질문을 던져도 됩니다.",
    "career.call.opening.instruction.near_finish":
      "\n## Incomplete onboarding near-finish opening\n현재 커리어 인터뷰는 아직 완료되지 않았지만 거의 끝난 상태입니다.\n- filledInsights: {filledCount}/{totalCount}\n- remainingInsights: {remainingCount}\n- 일반적인 새 통화 인사나 '오늘 어떠세요?', '최근 우선순위가 바뀐 게 있나요?' 같은 넓은 질문으로 시작하지 마세요.\n- 첫 문장은 '대화가 거의 끝났고, 더 정확한 추천/연결을 위해 마지막 확인만 빠르게 하겠다'는 취지를 자연스럽게 담으세요.\n- 최근 대화 맥락은 배경으로만 참고하고, 마지막으로 남은 한 가지 missing checklist question hint나 final priority confirmation으로 바로 이어가세요.\n- 이미 final priority confirmation에 사용자가 답한 맥락이면 같은 확인 질문을 반복하지 말고 짧게 closing으로 넘어가세요.",
    "career.call.opening.instruction.onboarding":
      '통화가 방금 시작되었습니다. 이 통화는 5분 커리어 인터뷰를 위한 통화입니다.\n도구는 사용하지 마세요. 지금은 통화 시작 멘트와 첫 질문만 합니다.\n한국어 존댓말로, 실제 전화 첫마디처럼 자연스럽게 말하세요.\n첫 문장에서는 이 대화가 왜 필요한지 가볍게 안내하세요. 더 잘 맞는 기회 추천과 회사 연결을 위해 현재 상황과 선호를 짧게 확인한다는 취지입니다.\n안내 직후 바로 질문 하나를 하세요.\n질문은 세션 instructions의 Onboarding Question Checklist에서 current_status가 missing인 항목 중 우선순위가 높은 항목을 고르고, 해당 항목의 question hint를 기반으로 만드세요.\n이미 covered인 항목이나 최근 대화에서 답한 주제는 다시 묻지 마세요.\n최근 대화 내역은 배경으로만 참고하고, missing checklist 항목과 question hint 기반 질문 선택을 대신하지 마세요.\n전체 첫 멘트는 3~4문장으로 끝내고, 마지막 문장은 사용자가 바로 답할 수 있는 질문이어야 합니다.\n예시: "안녕하세요. 이 5분 커리어 인터뷰는 하퍼가 더 잘 맞는 기회를 추천하고, 필요하면 회사와 연결할 때 후보자님의 맥락을 잘 전달하기 위해 짧게 확인하는 대화예요. 편하게 답해주시면 되고, 먼저 현재 탐색 온도부터 확인해볼게요. 지금 적극적으로 다음 기회를 찾고 계신 건지, 아니면 좋은 게 있으면 받아는 보고 싶다 정도인지 편하게 말씀해주세요."',
    "career.call.opening.instruction.reference_opening":
      "## 참고할 통화 시작 내용\n아래 문구나 질문의 취지를 통화 첫 멘트에 자연스럽게 반영하세요. 그대로 읽기보다 위 지시와 최근 대화 맥락에 맞게 말하세요.",
    "career.call.opening.instruction.use_recent_context":
      "위 최근 채팅 맥락은 통화 첫 멘트를 정할 때 가장 먼저 참고하세요. 마지막 대화가 아직 이어지는 흐름이면 일반적인 새 인사나 새 질문으로 시작하지 마세요.",
    "career.call.opening.recent_context.header": "## 최근 채팅 맥락\n",
    "career.call.opening.recent_context.user": "사용자",
    "career.call.opening.relative.day_many": "{count}일전",
    "career.call.opening.relative.day_one": "{count}일전",
    "career.call.opening.relative.hour_many": "{count}시간전",
    "career.call.opening.relative.hour_one": "{count}시간전",
    "career.call.opening.relative.just_now": "방금전",
    "career.call.opening.relative.minute_many": "{count}분전",
    "career.call.opening.relative.minute_one": "{count}분전",
    "career.call.opening.relative.month_many": "{count}개월전",
    "career.call.opening.relative.month_one": "{count}개월전",
    "career.call.wrapup_fallback.brief":
      "오늘은 짧게 이야기 나눴네요. 다음에 편하실 때 조금만 더 들려주시면 그에 맞춰 더 잘 도와드릴게요.",
    "career.call.wrapup_fallback.completed":
      "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 만족하실 만한 기회를 잘 골라서 가져와볼게요.",
    "career.call.wrapup_fallback.onboarding_remaining":
      "아직 온보딩이 조금 남아 있어요. 통화가 끊긴 지점부터 이 채팅에서 이어서 마무리하면, 그 기준으로 좋은 기회를 찾아드릴게요.",
    "career.chat.career_call_screen.082qr7j": "완료율",
    "career.chat.career_call_screen.0a6n15y": "자막 토글",
    "career.chat.career_call_screen.0n1pl8k":
      "커리어 인터뷰를 임의로 종료할 수 있어요. 거의 다 왔으니 2~3개의 질문에만 추가로 대답해주시면 자동으로 종료됩니다!",
    "career.chat.career_call_screen.0u4w1k5":
      "대화가 시작되면 여기에 표시됩니다.",
    "career.chat.career_call_screen.0yqbta2": "임의 종료",
    "career.chat.career_call_screen.15tfl05": "음소거 해제",
    "career.chat.career_call_screen.16d2ux9": "통화 종료",
    "career.chat.career_call_screen.1914g7j": "음소거",
    "career.chat.career_call_screen.1lwovam": "커리어 인터뷰 진행률",
    "career.chat.career_call_screen.force_complete_label": "지금 마무리하기",
    "career.chat.career_composer_section.017fk2m":
      "원하는 역할이나 조건을 편하게 알려주세요.",
    "career.chat.career_composer_section.02tj0kp": "약 5분",
    "career.chat.career_composer_section.041n9nc":
      "이력서와 링크를 분석 중입니다.",
    "career.chat.career_composer_section.0bxwclq":
      "통화 내용을 정리하는 중입니다.",
    "career.chat.career_composer_section.0e686ow":
      "새로운 조건이나 궁금한 점을 남겨주세요",
    "career.chat.career_composer_section.19raxy2":
      "기본 정보 제출 후 대화가 시작됩니다.",
    "career.chat.career_composer_section.1g4p5ul":
      "로그인 후 대화를 시작할 수 있습니다.",
    "career.chat.career_composer_section.1i8zl29":
      "아래 시작 버튼으로 대화를 시작해 주세요.",
    "career.chat.career_composer_section.1rqak4s":
      "바로 입력하면 대화가 이어집니다.",
    "career.chat.career_composer_section.1sjkx1r": "메시지 보내기",
    "career.chat.career_composer_section.1vn1k94": "통화 모드",
    "career.chat.career_composer_section.resume_interview_cta":
      "5분 커리어 인터뷰 이어가기",
    "career.chat.career_message_bubble.0jnmgxp":
      "좋아요. 최근 업데이트나 요즘 재밌게 하고 계신 일부터 편하게 들려주세요.",
    "career.chat.career_message_bubble.0o5swvp": "전화하기",
    "career.chat.career_message_bubble.0ovvmd7": "전화 대화",
    "career.chat.career_message_bubble.0whsa78": "통화하기",
    "career.chat.career_message_bubble.1tqt1ip": "이력서 보강",
    "career.chat.career_message_bubble.1xpjlib": "채팅으로 대답할 수 있어요.",
    "career.chat.career_message_bubble.optional_call_notice":
      "꼭 해야하는 대화는 아니고, 연결 시에 도움이될 정보를 몇가지 여쭤보기 위한 통화에요. 진행하지 않으셔도 {companyName} 측과의 연결은 제가 계속 진행할게요.",
    "career.chat.career_timeline_section.00l29f9":
      "글로벌 SaaS 팀 ML Engineer (비자 스폰서 가능)",
    "career.chat.career_timeline_section.06wb0ci": "회원가입",
    "career.chat.career_timeline_section.074rfeb": "로그인",
    "career.chat.career_timeline_section.079zqvv": "대화 이어가기",
    "career.chat.career_timeline_section.09zvq4w": "첫 방문이신가요?",
    "career.chat.career_timeline_section.0ai2d9e": "전화로 시작",
    "career.chat.career_timeline_section.0akm24y":
      "기존에 제출한 정보로 커리어 워크스페이스를 시작했습니다.",
    "career.chat.career_timeline_section.0arsq09":
      "안녕하세요. 회원님의 정보를 저장하기 위해서 우선 계정으로 로그인을 해주세요.",
    "career.chat.career_timeline_section.0bh3gyc": "불러오는 중...",
    "career.chat.career_timeline_section.0cx2fkc": "선택된 파일 없음",
    "career.chat.career_timeline_section.0dm46ie": "복수 선택 가능",
    "career.chat.career_timeline_section.0ebbrm3":
      "PDF, DOCX, TXT, MD 파일을 업로드할 수 있습니다.",
    "career.chat.career_timeline_section.0g10mif":
      "희망 역할과 피하고 싶은 조건만 짧게 확인할게요.",
    "career.chat.career_timeline_section.0hahmkh": "이력서 업로드",
    "career.chat.career_timeline_section.0hfdmut": "제출하기",
    "career.chat.career_timeline_section.0hm90b7":
      "남겨주신 피드백을 반영해서 다음 메시지를 준비하고 있어요.",
    "career.chat.career_timeline_section.0hzihgh": "분석 준비 중...",
    "career.chat.career_timeline_section.0ijd99q":
      "좋은 회사와 역할, 기회를 연결해드리기 위해 5분 커리어 인터뷰를 통해 몇가지 질문을 더 드리고 싶어요.",
    "career.chat.career_timeline_section.0jstyw1": "이미 계정이 있으신가요?",
    "career.chat.career_timeline_section.0l0nx9g": "준비 중...",
    "career.chat.career_timeline_section.0m1h5tz":
      "이력서와 링크 정보를 분석 중입니다...",
    "career.chat.career_timeline_section.0n6afuz":
      "이력서나 링크 하나만 있어도 우선 시작할 수 있습니다. 정보는 언제든지 바꿀 수 있습니다.",
    "career.chat.career_timeline_section.0ong27a": "추가 링크",
    "career.chat.career_timeline_section.0or3a9m":
      "미국 법인 AI Product 팀 Senior Software Engineer",
    "career.chat.career_timeline_section.0qzkj18":
      "다음 프로세스를 확인하고 있어요.",
    "career.chat.career_timeline_section.0t1ynxd": "이전 대화 더 보기",
    "career.chat.career_timeline_section.0twh3v7": "정리 중...",
    "career.chat.career_timeline_section.0v3ly8r":
      "우선 종료하고 나중에 이어할게요.",
    "career.chat.career_timeline_section.13lt218":
      "국내 딥테크 스타트업 Applied AI Engineer",
    "career.chat.career_timeline_section.171qysx":
      "5분 커리어 인터뷰가 아직 완료되지 않았어요.",
    "career.chat.career_timeline_section.17u6jy7": "대화 날짜",
    "career.chat.career_timeline_section.1ct6hfb":
      "방금 남긴 피드백을 바탕으로 다음 추천 방향을 정리하고 있어요.",
    "career.chat.career_timeline_section.1gfaiqo": "파일 선택",
    "career.chat.career_timeline_section.1go05rp":
      "이어서 답변하면 맞춤 기회 탐색을 시작할 수 있습니다.",
    "career.chat.career_timeline_section.1gvzqes": "링크 추가",
    "career.chat.career_timeline_section.1ovt2je": "주요 링크",
    "career.chat.career_timeline_section.1qh8yei":
      "하퍼가 들어오고 있습니다...",
    "career.chat.career_timeline_section.1r3zjih": "선택 저장하기",
    "career.chat.career_timeline_section.1sop3l6": "Google 로그인",
    "career.chat.career_timeline_section.1sv2rkn": "ID (이메일)",
    "career.chat.career_timeline_section.1xcwt3x": "채팅으로 시작",
    "career.chat.career_timeline_section.1xwvmgk": "처리 중...",
    "career.chat.career_welcome_screen.023rop8": "프로필 확인됨",
    "career.chat.career_welcome_screen.0ce6b4x": "회원",
    "career.chat.career_welcome_screen.0g4sq42": "대화 준비 중...",
    "career.chat.career_welcome_screen.169zgsw":
      "희망 역할, 근무 방식, 제외할 조건만 확인하면 실제 포지션 탐색으로 넘어갑니다.",
    "career.chat.career_welcome_screen.1gexpus":
      "첫 추천 기준을 짧게 정리할게요.",
    "career.chat.career_welcome_screen.criteria_with_name":
      "{displayName}님에게 맞는 기회 기준을 5분 정도만 맞춰볼게요.",
    "career.chat.career_welcome_screen.greeting_with_name":
      "안녕하세요 {displayName}님, 만나서 반갑습니다. 저는 하퍼입니다.",
    "career.chat.opportunity_preview_cards.open_posting_label":
      "{companyName} {title} 공고 열기",
    "career.chat.tool.open_url.start": "공유된 링크 내용을 확인하고 있습니다.",
    "career.chat.tool.request_internal_role_priority_review.start":
      "포지션 우선 검토 요청을 저장하고 있습니다.",
    "career.chat.tool.research_company.start": "회사 정보를 확인하고 있습니다.",
    "career.chat.tool.update_setting.start":
      "추천 발송 설정을 업데이트하고 있습니다.",
    "career.chat.tool.update_talent_profile.start":
      "프로필 정보를 업데이트하고 있습니다.",
    "career.common.career.028kv4g": "상세 보기",
    "career.common.career.030f28a": "검색 실패",
    "career.common.career.047a363": "회사 워치리스트를 불러오지 못했습니다.",
    "career.common.career.051p9x0":
      "하퍼는 숨겨진 스타트업 기회를 먼저 찾아 추천하고,",
    "career.common.career.055fv5b": "하이브리드",
    "career.common.career.07r9xc5": "다운로드",
    "career.common.career.07vhdpu": "이력서/링크 저장 및 새로운 정보 업데이트",
    "career.common.career.083cky2": "아직 회사 설명이 없습니다.",
    "career.common.career.09c4j2c": "링크 열기",
    "career.common.career.0beg208": "{count}개 추천",
    "career.common.career.0cp7wph":
      "회사 워치리스트 개수를 불러오지 못했습니다.",
    "career.common.career.0dtwsdj": "{count}개 공고 검토",
    "career.common.career.0f24yir": "역할 설명",
    "career.common.career.0h5494n": "추적중이에요",
    "career.common.career.0j3w14l": "새 이력서 선택",
    "career.common.career.0jt5nqc": "저장된 이력서가 없습니다.",
    "career.common.career.0ketgfl": "대면",
    "career.common.career.0kn6r0x":
      "펀딩, 채용, 팀 변화, 사업 성과 등 의미 있는 변화를 찾아서 알려드립니다.",
    "career.common.career.0madjab": "이전 기회",
    "career.common.career.0ol21b2": "회사 정보",
    "career.common.career.0rd0cjd": "안내",
    "career.common.career.0tmpcjv": "프로필 업데이트 중",
    "career.common.career.0vbpl1c": "이번 검색은 완료하지 못했습니다.",
    "career.common.career.0vrhfby":
      "이력서를 통해 회원님에 대해 알 수 있게되는 정보는 회사와의 연결 및 추천에 큰 영향을 미칩니다.",
    "career.common.career.0w4x7qh": "파일명 정보 없음",
    "career.common.career.0wohsg4": "JD 확인하기",
    "career.common.career.0xq40c2": "다음 공고",
    "career.common.career.0y3ajvx": "검색중...",
    "career.common.career.0y7cerf": "저장된 이력서",
    "career.common.career.0z5xpdx": "지원전 검토 사항",
    "career.common.career.11hatjy": "커리어 설정",
    "career.common.career.11j6jdx": "대화 내용을 정리하고 있어요.",
    "career.common.career.1338q8i": "설정",
    "career.common.career.14ybad0": "업데이트 노트",
    "career.common.career.152e0fk": "공고 검토 완료",
    "career.common.career.16x7oad": "설정 닫기",
    "career.common.career.16yncp4":
      "프로필과 최근 대화를 반영해 최적의 기회를 찾고 있습니다.",
    "career.common.career.18neuzv": "다음 기회",
    "career.common.career.19aqpg8": "역할과 조건을 짧게 확인",
    "career.common.career.1bbxwls":
      "어떤 수준의 매칭에서 회사가 프로필을 볼 수 있는지 정합니다.",
    "career.common.career.1ceyibb":
      "후보자 관점에서 커리어 기회와 조건 협상까지 함께 돕는 Career 매니저입니다.",
    "career.common.career.1clmbsb": "요청한 검색을 중지했습니다.",
    "career.common.career.1d6xtz2": "검색 완료",
    "career.common.career.1kdjvb7": "오랜만에 이어갈 대화를 준비하고 있어요.",
    "career.common.career.1lzad2w": "대화 요약",
    "career.common.career.1nldebx": "검토하기",
    "career.common.career.1nwpekv": "검색 중지",
    "career.common.career.1ominm4": "내 링크",
    "career.common.career.1r843ma": "원격",
    "career.common.career.1ugn5p7":
      "아직 상세 역할 설명이 정리되지 않았습니다.",
    "career.common.career.1v4kit0":
      "여기에 등록된 회사와는 매칭이 일어나지 않고 프로필도 절대 공유되지 않습니다.",
    "career.common.career.1xci024":
      "통화 내용을 정리하고 다음 메시지를 준비하고 있어요.",
    "career.common.career.1xe09ft": "Harper가 요약한 정보",
    "career.common.career.1xo6n8a": "이전 공고",
    "career.common.career.recommendation_search_stopped_title":
      "포지션 검색 중지됨",
    "career.common.career_chat_panel.1q1egw3": "통화 연결 중...",
    "career.common.career_flow_provider.06f4hcx":
      "12시간 인사 스트림이 완료되기 전에 종료되었습니다.",
    "career.common.career_flow_provider.0750gye":
      "12시간 인사 생성에 실패했습니다.",
    "career.common.career_flow_provider.0cjev5a":
      "지금까지 저장된 내 프로필, 선호, 최근 피드백 데이터를 기준으로 지금 검토할 만한 공개 채용 공고를 추천해줘. 새로운 장기 선호는 저장하지 말고, 현재 데이터 기반으로 한 번만 찾아줘.",
    "career.common.career_flow_provider.16uupip":
      "커리어 인터뷰 종료 중 오류가 발생했습니다.",
    "career.common.career_flow_provider.19x0zaz":
      "회사 팔로우 상태를 변경하지 못했습니다.",
    "career.common.career_flow_provider.1tnnmyb":
      "커리어 인터뷰 종료에 실패했습니다.",
    "career.common.career_flow_provider.1z048f4":
      "회사 팔로우 후속 메시지를 만들지 못했습니다.",
    "career.common.career_flow_provider.request_more_open_positions":
      "다른 오픈 포지션 더 추천해줘",
    "career.common.career_flow_provider.resume_interview_error":
      "커리어 인터뷰 이어가기를 실행하지 못했습니다.",
    "career.common.career_history_panel.00rerkr": "좋은 기회를 찾고 있습니다.",
    "career.common.career_history_panel.01m9cc2": "더 불러올 항목이 있습니다.",
    "career.common.career_history_panel.02i826z": "새 포지션",
    "career.common.career_history_panel.02jvl2x":
      "첫 추천 후보를 검토하고 있습니다.",
    "career.common.career_history_panel.0496lr7": "희망 역할",
    "career.common.career_history_panel.05lg6gq":
      "저장된 경력과 선호 기준을 함께 확인합니다.",
    "career.common.career_history_panel.06l333i": "포지션 탐색",
    "career.common.career_history_panel.06mgpci": "저장함",
    "career.common.career_history_panel.06sq5fd": "대면근무",
    "career.common.career_history_panel.090irfh": "파트타임",
    "career.common.career_history_panel.0boi6up": "후보 압축",
    "career.common.career_history_panel.0cxzeie": "신호 정리",
    "career.common.career_history_panel.0eamanf":
      "조건과 맞지 않는 역할은 추천에서 제외합니다.",
    "career.common.career_history_panel.0fhjm3n": "검토 진행 중",
    "career.common.career_history_panel.0fw7sr6":
      "네트워크와 공개 포지션을 같은 기준으로 비교합니다.",
    "career.common.career_history_panel.0gesjui": "원격근무",
    "career.common.career_history_panel.0gfcdit":
      "어떤 기회에 열려계신지 알려주세요..",
    "career.common.career_history_panel.0iymhpv": "자료 검토",
    "career.common.career_history_panel.0jj9mjx":
      "다음에 맡고 싶은 역할과 레벨을 확인합니다.",
    "career.common.career_history_panel.0kl8zzx":
      "희망 역할, 근무 방식, 제외 조건 등을 알려주시면 첫 추천을 시작할 수 있습니다.",
    "career.common.career_history_panel.0mo6t6e": "첫 추천 준비",
    "career.common.career_history_panel.0okcy6f":
      "이 탭에 해당하는 기회가 아직 없습니다.",
    "career.common.career_history_panel.0p8wa8t":
      "첫 추천이 준비되면 새 포지션에 표시됩니다.",
    "career.common.career_history_panel.0paqqgp": "제외됨",
    "career.common.career_history_panel.0pes81b":
      "대화를 통해 기준을 확인하면 첫 포지션 탐색을 시작합니다.",
    "career.common.career_history_panel.0qv04k8":
      "지역, 근무 형태, 보상 기준을 정합니다.",
    "career.common.career_history_panel.0rwgnws":
      "프로필과 대화에서 강한 경력 신호를 정리합니다.",
    "career.common.career_history_panel.0s3czqf":
      "저장된 정보를 불러오는 중입니다...",
    "career.common.career_history_panel.0s6myeq": "탐색 진행 중",
    "career.common.career_history_panel.0sbhtqh": "인턴",
    "career.common.career_history_panel.0shxyyt":
      "관심 없는 산업, 회사 유형, 역할을 제외합니다.",
    "career.common.career_history_panel.0taw0z7": "대면 + 원격",
    "career.common.career_history_panel.0wrwhc3": "제외 기준",
    "career.common.career_history_panel.0xu63p6": "적합도 정렬",
    "career.common.career_history_panel.0y27adb": "진행중",
    "career.common.career_history_panel.11est1e": "결과 정리",
    "career.common.career_history_panel.11oeye3": "Harper와 대화하기",
    "career.common.career_history_panel.12v6hq4":
      "조건에 맞는 포지션만 새 목록에 남깁니다.",
    "career.common.career_history_panel.13mr3sj": "근무 조건",
    "career.common.career_history_panel.17505te":
      "대화에서 정리한 기준으로 실제로 보낼 만한 역할만 남기고 있습니다.",
    "career.common.career_history_panel.1aylp85": "보관함",
    "career.common.career_history_panel.1ge5j94":
      "첫 추천이 준비되면 새 포지션 탭에서 바로 검토할 수 있습니다.",
    "career.common.career_history_panel.1h65j93":
      "새로 받은 기회를 모두 검토했습니다.",
    "career.common.career_history_panel.1hsndwk": "진행 종료",
    "career.common.career_history_panel.1ijllph":
      "기준에 맞는 포지션만 남기고 있습니다. 준비되면 새 포지션에 표시됩니다.",
    "career.common.career_history_panel.1knq1rh": "경력/이력은 확인했습니다.",
    "career.common.career_history_panel.1n5k969": "리스트 보기",
    "career.common.career_history_panel.1p6gpzi":
      "검토가 끝난 포지션은 새 포지션 탭에 바로 표시됩니다.",
    "career.common.career_history_panel.1q435d3":
      "이 상태에 해당하는 기회가 아직 없습니다.",
    "career.common.career_history_panel.1rvnrzl": "계약직",
    "career.common.career_history_panel.1vrs10j": "제외한 포지션",
    "career.common.career_history_panel.1xfuqgb": "보드 보기",
    "career.common.career_history_panel.applied": "지원함",
    "career.common.career_history_panel.archived_tooltip": "제외한 포지션",
    "career.common.career_history_panel.hidden_tab": "보관함",
    "career.common.career_history_panel.interested_status": "관심 있음",
    "career.common.career_history_panel.saved_positions_tab": "저장한 포지션",
    "career.common.career_hook_messages.02tdf5b":
      "기회 목록을 새로고침하지 못했습니다.",
    "career.common.career_hook_messages.043pjii":
      "LinkedIn 또는 이력서 정보를 자동으로 가져오지 못했습니다.",
    "career.common.career_hook_messages.051j8yt":
      "설정 정보를 불러오지 못했습니다.",
    "career.common.career_hook_messages.0598bor":
      "talent_users 초기화에 실패했습니다.",
    "career.common.career_hook_messages.06v3zcd":
      "프로필과 이력서/링크 정보를 저장했습니다.",
    "career.common.career_hook_messages.082utew":
      "프로필 정보를 다시 가져오지 못했습니다.",
    "career.common.career_hook_messages.0848zqr":
      "이력서/링크 정보를 저장했습니다.",
    "career.common.career_hook_messages.09pr3ij":
      "이력서/링크는 저장했지만 자동 프로필 구성은 실패했습니다. ({reason})",
    "career.common.career_hook_messages.09wz9hs": "Reference link: {link}",
    "career.common.career_hook_messages.0aw1w91":
      "Harper insight 저장에 실패했습니다.",
    "career.common.career_hook_messages.0c68jwx":
      "안녕하세요, 직접 통화로 이야기하게 되어 좋네요. 제가 먼저 하나씩 여쭤볼게요. 편하게 답해주시면 더 잘 맞는 기회를 찾는 데 도움이 됩니다.",
    "career.common.career_hook_messages.0dp8x5s":
      "프로필 선호 정보 저장에 실패했습니다.",
    "career.common.career_hook_messages.0em2gjm":
      "이력서 텍스트를 읽지 못했습니다. 다른 파일로 시도해 주세요.",
    "career.common.career_hook_messages.0em3sq3":
      "프로필 정보를 다시 가져오지 못했습니다. ({reason})",
    "career.common.career_hook_messages.0gcst4g":
      "선택 저장 중 오류가 발생했습니다.",
    "career.common.career_hook_messages.0gmwfn1": "이미 종료된 call입니다.",
    "career.common.career_hook_messages.0gv3kjj": "세션을 불러오지 못했습니다.",
    "career.common.career_hook_messages.0ikqe9o": "선택 저장에 실패했습니다.",
    "career.common.career_hook_messages.0jhqb6p":
      "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 잘 맞는 기회를 찾아볼게요. 오늘 대화는 여기까지 할게요.",
    "career.common.career_hook_messages.0kbrk6c":
      "Call Wrap-up 응답이 비어 있습니다.",
    "career.common.career_hook_messages.0la0cjn":
      "대화 메시지를 불러오지 못했습니다.",
    "career.common.career_hook_messages.0ljgbz5":
      "종료 메시지 생성에 실패했습니다.",
    "career.common.career_hook_messages.0mp3zyf":
      "기본 정보 제출 중 오류가 발생했습니다.",
    "career.common.career_hook_messages.0nb9l75":
      "이력서/링크는 저장했지만 자동 프로필 업데이트는 실패했습니다. ({reason})",
    "career.common.career_hook_messages.0ptxnu1":
      "대화 시작 준비 중 오류가 발생했습니다.",
    "career.common.career_hook_messages.0q7hdea": "온보딩 시작에 실패했습니다.",
    "career.common.career_hook_messages.0r1cfx7":
      "기회 목록을 불러오지 못했습니다.",
    "career.common.career_hook_messages.0srl5yk":
      "일부 정보를 가져오지 못했지만 가능한 범위에서 프로필을 업데이트했습니다.",
    "career.common.career_hook_messages.0tuztsz":
      "메시지 전송 중 오류가 발생했습니다.",
    "career.common.career_hook_messages.0u89sn8":
      "이력서/링크를 저장하고 새 정보를 프로필에 반영했습니다.",
    "career.common.career_hook_messages.0vgs7ig":
      "이력서 파일 업로드에 실패했습니다.",
    "career.common.career_hook_messages.0wokf45":
      "Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    "career.common.career_hook_messages.0zitxiy":
      "비밀번호는 6자 이상 입력해 주세요.",
    "career.common.career_hook_messages.101suqx":
      "로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.",
    "career.common.career_hook_messages.11ltltf":
      "인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    "career.common.career_hook_messages.11yir7x":
      "기회 상태를 업데이트하지 못했습니다.",
    "career.common.career_hook_messages.12bbx7p": "프로필 저장에 실패했습니다.",
    "career.common.career_hook_messages.19kzumo": "설정 저장에 실패했습니다.",
    "career.common.career_hook_messages.1a26ni5":
      "나중에 이어하기 준비에 실패했습니다.",
    "career.common.career_hook_messages.1ady7dv":
      "이력서 혹은 주요 링크를 업로드해 주세요.",
    "career.common.career_hook_messages.1b9i4mv":
      "인증 메일을 보냈습니다. 메일의 링크를 열어 회원가입을 완료한 뒤 다시 로그인해 주세요.",
    "career.common.career_hook_messages.1bxad2p":
      "PDF에서 텍스트를 읽지 못했습니다.",
    "career.common.career_hook_messages.1eco5r7":
      "이메일과 비밀번호를 입력해 주세요.",
    "career.common.career_hook_messages.1g1lzhz":
      "나중에 이어하기 준비 중 오류가 발생했습니다.",
    "career.common.career_hook_messages.1gaikb4":
      "다시 가져올 이력서나 LinkedIn 링크가 없습니다.",
    "career.common.career_hook_messages.1gxr7hd": "메시지 전송에 실패했습니다.",
    "career.common.career_hook_messages.1it3b7e": "메모를 저장하지 못했습니다.",
    "career.common.career_hook_messages.1j9l810":
      "Call Wrap-up 재생성에 실패했습니다.",
    "career.common.career_hook_messages.1ja09cr":
      "대화 시작 준비에 실패했습니다.",
    "career.common.career_hook_messages.1kdy4hj":
      "피드백 후속 메시지를 만들지 못했습니다.",
    "career.common.career_hook_messages.1mnjdmp":
      "메시지 스트림이 완료되기 전에 종료되었습니다.",
    "career.common.career_hook_messages.1ntx9r3":
      "기회 목록을 더 불러오지 못했습니다.",
    "career.common.career_hook_messages.1ojtglo":
      "아직 이메일 인증이 완료되지 않았습니다. 받은 메일의 인증 링크를 먼저 확인해 주세요.",
    "career.common.career_hook_messages.1qsjb9o":
      "이미 가입된 이메일입니다. 로그인으로 계속해 주세요.",
    "career.common.career_hook_messages.1rktk41":
      "이메일 혹은 비밀번호가 올바르지 않습니다.",
    "career.common.career_hook_messages.1sh0keg":
      "Call Wrap-up 재생성 중 오류가 발생했습니다.",
    "career.common.career_hook_messages.1u6tsv3":
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    "career.common.career_hook_messages.1uqz7wr": "기회를 불러오지 못했습니다.",
    "career.common.career_hook_messages.invalid_linkedin_profile_url":
      "올바른 URL이 아닙니다.",
    "career.common.career_in_page_tabs.1h43miz": "확인이 필요합니다",
    "career.common.career_mobile_chat_launcher.0hu1shh":
      "Harper가 답변을 준비하고 있습니다...",
    "career.common.career_mobile_chat_launcher.0pnsgrt": "열기",
    "career.common.career_mobile_chat_launcher.0q9yygi": "Harper가 답했어요",
    "career.common.career_mobile_chat_launcher.0twl8ov": "채팅 접기",
    "career.common.career_mobile_chat_launcher.1bjhre2":
      "아래로 드래그하거나 닫기 버튼을 눌러 접을 수 있습니다.",
    "career.common.career_mobile_chat_launcher.1j1ugk2": "Harper 채팅",
    "career.common.career_mobile_chat_launcher.chat_interview_cta":
      "채팅으로 5분 커리어 인터뷰를 완료하세요",
    "career.common.career_mobile_top_bar.0kpy78r": "화요일",
    "career.common.career_mobile_top_bar.0wg5ren": "금요일",
    "career.common.career_mobile_top_bar.1f1oien": "수요일",
    "career.common.career_mobile_top_bar.1ih373f": "월요일",
    "career.common.career_mobile_top_bar.1jmvi1w": "목요일",
    "career.common.career_mobile_top_bar.1s93gcz": "일요일",
    "career.common.career_mobile_top_bar.1xwrfxz": "토요일",
    "career.common.career_support_inquiry_modal.012iiio":
      "개선사항 혹은 문의사항을 알려주세요.",
    "career.common.career_support_inquiry_modal.0au4clq":
      "아래에서 자유롭게 작성해주세요.",
    "career.common.career_support_inquiry_modal.0snjgs4":
      "문의 내용을 입력해 주세요.",
    "career.common.career_support_inquiry_modal.0ustycb":
      "문의 접수 중 오류가 발생했습니다.",
    "career.common.career_support_inquiry_modal.10hs5il":
      "개선사항이나 문의사항을 입력해 주세요.",
    "career.common.career_support_inquiry_modal.11apzn2": "닫기",
    "career.common.career_support_inquiry_modal.16ya5aa": "문의 모달 닫기",
    "career.common.career_support_inquiry_modal.17hinuj":
      "문의가 접수되었습니다.",
    "career.common.career_support_inquiry_modal.1fep109":
      "올바른 이메일 형식으로 입력해 주세요.",
    "career.common.career_support_inquiry_modal.1ii5ibp": "제출",
    "career.common.career_support_inquiry_modal.1kjxfan": "접수 중",
    "career.common.career_support_inquiry_modal.1kxvbd7":
      "이메일을 입력해 주세요.",
    "career.common.career_support_inquiry_modal.1o8h20r":
      "문의 저장에 실패했습니다.",
    "career.common.career_support_inquiry_modal.1x7y6fe":
      "Harper가 커리어 에이전트로써 어떤걸 해주기를 원하시나요?",
    "career.common.career_support_inquiry_modal.reply_email_notice":
      "확인 후 {email}로 답변드리겠습니다.",
    "career.common.career_support_inquiry_modal.submit_inquiry": "문의 보내기",
    "career.common.career_update_notes_modal.0ha8vft": "제안하기",
    "career.common.career_update_notes_modal.1e7ecir": "업데이트 노트 내용",
    "career.common.career_update_notes_modal.1rg2zqc": "Harper 업데이트 노트",
    "career.common.career_workspace_nav.02pzw1u": "개선사항 및 문의사항",
    "career.common.career_workspace_screen.0b0v9cr": "프로필",
    "career.common.career_workspace_screen.0jpahnv": "포지션",
    "career.common.career_workspace_screen.18vor62": "채팅 패널 너비 조절",
    "career.common.career_workspace_screen.1kr4bnb": "홈",
    "career.common.career_workspace_screen.1nwthrd": "커리어 페이지 로딩 중",
    "career.common.career_workspace_screen.mobile_inbox": "추천된 기회",
    "career.common.career_workspace_screen.mobile_jobs": "보관함",
    "career.common.constants.079mmhw": "링크드인",
    "career.common.constants.0iah44y": "개인 웹사이트",
    "career.common.conversation_starters.07qcswd":
      "더 이야기하고 더 좋은 연결 받기",
    "career.common.conversation_starters.0o5blh4": "선호 조건 업데이트",
    "career.common.conversation_starters.1gwajda":
      "선호 조건을 업데이트하고 싶어요.",
    "career.common.conversation_starters.1hl3ggw": "경험 더 들려주기",
    "career.common.conversation_starters.1qmlix7":
      "제 정보와 경험을 조금 더 자세히 이야기할 수 있어요.",
    "career.common.conversation_starters.1sfi8z4": "선호 조건 업데이트하기",
    "career.common.conversation_starters.more_open_positions":
      "오픈 포지션 더 추천받기",
    "career.common.conversation_starters.requesting_more_open_positions":
      "요청 중...",
    "career.common.internal_connection_onboarding_modal.037ebaa":
      "전화 연결 중...",
    "career.common.internal_connection_onboarding_modal.059fa2p": "대화하기",
    "career.common.internal_connection_onboarding_modal.0pmrpu5":
      "Harper와의 가벼운 대화로 생각해주세요. 짧게 이야기하면서 어떤 것들을 선호하시고, 어떤 것들이 고려된 연결을 원하시는지 얘기해주시면 됩니다.",
    "career.common.internal_connection_onboarding_modal.0vo80wd":
      "연결 수락 전에 5분 커리어 인터뷰가 필요해요.",
    "career.common.internal_connection_onboarding_modal.0z48n2w": "확인",
    "career.common.internal_connection_onboarding_modal.18w9rer":
      "회사에 전달해도 되는 소개 맥락을 정리합니다.",
    "career.common.internal_connection_onboarding_modal.1lyfoil":
      "회원님의 희망 역할과 근무 조건을 확인합니다.",
    "career.common.internal_connection_onboarding_modal.1sbmfzi":
      "채팅으로 하기",
    "career.common.internal_connection_onboarding_modal.1sj53gq":
      "이 대화가 끝나면 Harper가 회원님 기준에 맞게 연결을 진행할 수 있습니다.",
    "career.common.internal_connection_onboarding_modal.1wjj1zl": "전화로 하기",
    "career.common.internal_connection_onboarding_modal.1yorbt8":
      "내부 기회 연결은 회사에 회원님을 소개하고 추천하는 단계라, 회사에서 궁금해할만한 정보를 저에게 알려주셔야 이후 단계를 진행할 수 있어요.",
    "career.common.opportunity_feedback_note.0aslysy": "수락함",
    "career.common.opportunity_type_meta.0066ceh":
      "근무 조건이 맞지않아요(리모트, 위치 등)",
    "career.common.opportunity_type_meta.01zzlpt": "하퍼가 발견한 기회",
    "career.common.opportunity_type_meta.03vuko5":
      "이 메모는 Harper가 다음 추천 방향을 조정할 때 참고합니다. 선택하지 않고 바로 제출하실 수 있습니다.",
    "career.common.opportunity_type_meta.06j4qod": "기타 직접 입력",
    "career.common.opportunity_type_meta.08t1dhj": "하퍼의 연결 제안",
    "career.common.opportunity_type_meta.09zmhwn":
      "이 메모는 Harper가 다음 추천과 대화 맥락을 정리할 때 참고합니다.",
    "career.common.opportunity_type_meta.0aqqdks":
      "회사 측이 하퍼를 통해 회원님에게 직접 연결을 요청한 케이스입니다. 수락 여부를 확인한 뒤에만 연락처 공유와 후속 조율을 진행합니다.",
    "career.common.opportunity_type_meta.0fr7lmx":
      "연결 요청을 거절하시겠어요?",
    "career.common.opportunity_type_meta.0hc5boq":
      "이 메모는 Harper가 연결 수락 후 다음 단계를 준비할 때 참고합니다. 바로 제출하셔도 됩니다.",
    "career.common.opportunity_type_meta.0ms0wrm":
      "어떤 점이 괜찮게 느껴졌는지, Harper가 다음 단계에서 참고할 포인트를 적어주세요.",
    "career.common.opportunity_type_meta.0ume46n": "지원함",
    "career.common.opportunity_type_meta.0w9kcow":
      "다음에는 더 좋은 기회를 제공해드리겠습니다.",
    "career.common.opportunity_type_meta.0woigko": "Intro 요청",
    "career.common.opportunity_type_meta.1225b7g":
      "어떤 점이 맞지 않았는지, 다음 추천에서 피하고 싶은 조건을 적어주세요.",
    "career.common.opportunity_type_meta.12xbtqt": "거절하기",
    "career.common.opportunity_type_meta.16ujfch": "외부 JD",
    "career.common.opportunity_type_meta.19l43m1":
      "하퍼가 공개 채용 페이지와 JD를 탐색해 회원님의 경력, 선호 조건, 다음 커리어 방향과 맞춰 본 포지션입니다. 지원은 외부 JD에서 직접 진행하고, 저장한 항목은 추천 기준 개선과 가능한 연결 탐색에 활용됩니다.",
    "career.common.opportunity_type_meta.1b7fcpk":
      "거절하거나 보류하고 싶은 이유가 있다면 간단히 적어주세요.",
    "career.common.opportunity_type_meta.1be34hr":
      "부담스럽거나 지금 방향과 맞지 않는 이유를 간단히 적어주세요.",
    "career.common.opportunity_type_meta.1c01yxx":
      "다음에는 더 좋은 기회를 찾아오겠습니다.",
    "career.common.opportunity_type_meta.1d0ajqw":
      "연결을 수락하는 이유나 먼저 확인하고 싶은 조건이 있다면 간단히 남겨주세요. 바로 제출하셔도 됩니다.",
    "career.common.opportunity_type_meta.1ebvtk6":
      "저장하기 전에 한 줄만 남겨주세요",
    "career.common.opportunity_type_meta.1gbs2on": "회사 추천",
    "career.common.opportunity_type_meta.1ggf9hs":
      "아직 회사를 직접 만나고 싶은 생각은 없어요.",
    "career.common.opportunity_type_meta.1i6mw5l":
      "회사 혹은 조건이 기준을 충족하지 못해요.",
    "career.common.opportunity_type_meta.1l3r1qb":
      "(Optional) 전달하고 싶은 메모가 있으면 적어주세요.",
    "career.common.opportunity_type_meta.1llzatw":
      "선호하는 유형의 도메인/회사/서비스가 아니에요.",
    "career.common.opportunity_type_meta.1n5sz4w": "연결 수락",
    "career.common.opportunity_type_meta.1q2m2s8":
      "저희가 부담되시지 않게 회사 측에 잘 전달할게요. 혹시 가능하시다면, 어떤 이유로 거절하시는지 저희에게 알려주세요. 다음번에 더 좋은 기회를 받으실 수 있게 반영하겠습니다.",
    "career.common.opportunity_type_meta.1q9hdqb":
      "이 메모는 Harper가 다음 추천과 고객사 매칭 판단을 조정할 때 참고합니다.",
    "career.common.opportunity_type_meta.1qbevng": "직접 연결 요청",
    "career.common.opportunity_type_meta.1rq4mqk": "채용 담당자와 연결됩니다.",
    "career.common.opportunity_type_meta.1t09h2g":
      "하퍼가 회사의 채용 니즈를 확인하고 회원님에게 먼저 연결 의사를 묻는 추천입니다. 수락 전에는 프로필을 회사에 전달하지 않고, 수락 후 하퍼가 소개와 후속 조율을 진행합니다.",
    "career.common.opportunity_type_meta.1tsaf8t":
      "역할이나 직무가 맞지 않아요",
    "career.common.opportunity_type_meta.1woxqfo": "회사 / 출처",
    "career.common.opportunity_type_meta.1yj6p99": "오픈 포지션",
    "career.common.opportunity_type_meta.1yobmng":
      "연결 수락 후 다음 단계로 진행합니다.",
    "career.common.opportunity_type_meta.1yy34n1":
      "(Optional) 어떤 점이 괜찮게 느껴졌는지, Harper가 다음 단계에서 참고할 포인트를 적어주세요.",
    "career.common.opportunity_type_meta.connected_stage_label": "연결됨",
    "career.common.opportunity_type_meta.external_already_applied":
      "이미 지원했던 회사/역할입니다.",
    "career.common.opportunity_type_meta.external_expired_posting":
      "만료된 공고에요.",
    "career.common.opportunity_type_meta.external_negative_action":
      "나와 안맞아요",
    "career.common.opportunity_type_meta.external_positive_action":
      "관심 있어요",
    "career.common.talent_career_modal.18ppi14": "모달 닫기",
    "career.common.use_career_voice_input.02eo5ko":
      "실시간 연결에 실패했습니다. 채팅으로 진행해 주세요.",
    "career.company.career_company_detail_drawer.0amy3om":
      "회사 정보를 불러오지 못했습니다.",
    "career.company.career_company_detail_drawer.0ihv86b": "회사 상세 정보",
    "career.company.career_company_detail_drawer.1v2v38p": "회사 정보 닫기",
    "career.company.company_card.1gncj7z": "회사 업데이트를 정리 중입니다.",
    "career.company.company_card.1m5x6m1": "최근 시그널",
    "career.company.company_card.1n9j2yp": "회사 설명을 정리 중입니다.",
    "career.company.company_data.last_funding_round_description":
      "최근 라운드 {description}",
    "career.company.company_data.last_funding_round_description_label":
      "최근 라운드",
    "career.company.company_data.last_funding_stage": "최근 단계 {stage}",
    "career.company.company_data.last_funding_stage_label": "최근 단계",
    "career.company.company_data.main_investors": "주요 투자자 {investors}",
    "career.company.company_data.main_investors_label": "주요 투자자",
    "career.company.company_data.total_funding_raised": "총 투자 {amount}",
    "career.company.company_data.total_funding_raised_label": "총 투자",
    "career.company.company_detail_view.01kpxqk": "직원 수",
    "career.company.company_detail_view.02ioip6": "설립 연도",
    "career.company.company_detail_view.05y0iqp": "회사를 찾지 못했습니다.",
    "career.company.company_detail_view.0d3086e": "IPO 상태",
    "career.company.company_detail_view.0gx8zud": "지역 그룹",
    "career.company.company_detail_view.0h3m8a3":
      "창업자 정보를 불러오지 못했습니다.",
    "career.company.company_detail_view.0izicuk": "회사 설명",
    "career.company.company_detail_view.0lq2ran": "운영 상태",
    "career.company.company_detail_view.0qsmhob": "전문 분야",
    "career.company.company_detail_view.0vk24i0": "회사 유형",
    "career.company.company_detail_view.18zvias": "웹사이트",
    "career.company.company_detail_view.198i5rb": "본사 위치",
    "career.company.company_detail_view.199tx5d": "카테고리",
    "career.company.company_detail_view.1gy0i9e": "관련 링크",
    "career.company.company_detail_view.1im9ivy": "Harper가 찾아본 내용",
    "career.company.company_detail_view.1si5hsi": "채용 페이지",
    "career.company.company_detail_view.1sihgzp": "창업자",
    "career.company.company_detail_view.1u6998j": "투자자",
    "career.company.company_empty_state.0akildu":
      "최근 6개월 안에 활성 채용 신호가 있고 LinkedIn이 연결된 회사 중에서 프로필 방향에 맞는 회사를 저장합니다.",
    "career.company.company_empty_state.17mqvmz":
      "아직 팔로우한 회사가 없습니다.",
    "career.company.employee_count.max": "{end}명 이하",
    "career.company.employee_count.min": "{start}명 이상",
    "career.company.employee_count.range": "{start}-{end}명",
    "career.company.follow.discovery_channel_summary":
      "회사 측 검색 노출 활성. 이 회사가 인재를 찾거나 Harper에 채용 요청을 보낼 때 팔로워 신호를 우선 반영합니다.",
    "career.company.follow.tracking_summary":
      "시그널 추적 중. 펀딩, 채용, Founder 글, 팀 변화 중 의미 있는 변화만 요약합니다.",
    "career.company.follow_button.19dhowc": "팔로잉",
    "career.company.follow_button.1p6sttz": "팔로우",
    "career.company.followed_at": "{relative}부터 팔로잉",
    "career.company.following": "팔로잉 중",
    "career.company.founded_year": "{year}년 설립",
    "career.company.snapshot.follow_up":
      "더 궁금한 건 없으신가요? Harper가 외부에서 접근하기 어려운 정보들까지 함께 참고해서 알려드려요.",
    "career.company.snapshot.investigation_date": "조사일",
    "career.company.snapshot.message.completed":
      "{companyName} 회사 조사를 완료했습니다.",
    "career.company.snapshot.message.error":
      "{companyName} 회사 조사 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
    "career.company.snapshot.message.loaded_recent":
      "{companyName} 회사 조사 결과를 최근 저장된 snapshot에서 불러왔습니다.",
    "career.company.snapshot.message.loaded_snapshot":
      "{companyName} 회사 조사 snapshot을 최근 저장분에서 불러왔습니다.",
    "career.company.snapshot.message.saved_snapshot":
      "{companyName} 회사 조사 snapshot을 저장했습니다.",
    "career.company.snapshot.message.summary_failed":
      "회사 조사 결과를 채팅용 요약으로 정리하지 못했습니다. 잠시 후 다시 시도해주세요.",
    "career.company.snapshot.prompt.json_only":
      "반드시 아래 JSON 스키마를 그대로 채워서 단일 JSON 객체로만 답하세요. 마크다운 코드펜스나 설명 텍스트를 추가하지 마세요.",
    "career.company.snapshot.prompt.reason_line":
      "\n사용자가 이 회사에 관심을 갖게 된 맥락: {reason}",
    "career.company.snapshot.prompt.research_priority":
      "최신 공개 정보를 우선시하고, 가능한 경우 한국 시장 맥락도 함께 고려하세요.",
    "career.company.snapshot.prompt.research_scope":
      "Web search 도구를 적극 활용해 이 회사의 사업, 제품, 비즈니스 모델, 자금/재무 상태, 팀/문화, 채용 맥락, 리스크/논란을 조사하세요.",
    "career.company.snapshot.prompt.role":
      "당신은 한국어 커리어 어드바이저 Harper의 회사 리서치 도우미입니다.",
    "career.company.snapshot.prompt.sources_rule":
      "출처는 실제로 참고한 URL만 최대 10개까지 포함하세요. 정보가 부족한 섹션은 '확실한 정보를 찾지 못했습니다.' 처럼 있는 그대로 작성하세요.",
    "career.company.snapshot.prompt.strict_json":
      "JSON 문법을 엄격히 지키고, 객체나 배열의 마지막 항목 뒤에 trailing comma를 넣지 마세요.",
    "career.company.snapshot.prompt.target_company": "대상 회사: {companyName}",
    "career.company.snapshot.sources_label": "출처:",
    "career.company.watchlist_types.0kgfx63": "시그널",
    "career.history.career_mobile_jobs_view.0f42kd7":
      "아직 새로 추천된 포지션이 없습니다.",
    "career.history.career_mobile_jobs_view.0llq6g8":
      "제외된 포지션이 없습니다.",
    "career.history.career_mobile_jobs_view.0ujd7dh": "좌우로 넘겨 보세요",
    "career.history.career_mobile_jobs_view.1gufjot": "내 메모",
    "career.history.career_mobile_jobs_view.1m3uw9j":
      "관심 있는 포지션이 없습니다.",
    "career.history.career_mobile_jobs_view.mobile_active_empty":
      "지원한 포지션이 없습니다.",
    "career.history.career_mobile_jobs_view.mobile_closed_empty":
      "종료된 포지션이 없습니다.",
    "career.history.career_mobile_jobs_view.mobile_connected_empty":
      "진행중인 포지션이 없습니다.",
    "career.history.career_mobile_jobs_view.mobile_hidden_empty":
      "숨긴 포지션이 없습니다.",
    "career.history.feedback_modal.08qkm91": "메모 작성",
    "career.history.feedback_modal.109eupo": "메모 수정",
    "career.history.feedback_modal.12volkp":
      "이 포지션에 대해 기억해둘 내용이나 확인할 점을 적어주세요.",
    "career.history.feedback_modal.1m0q35j":
      "해당 포지션을 다시 볼 때 참고할 내용을 적어둘 수 있습니다.",
    "career.history.feedback_modal.1xp6hfy": "저장",
    "career.history.history_oppotunity_info_modal.01tamdx": "어떤 요청인가요?",
    "career.history.history_oppotunity_info_modal.02wru4l":
      "후속 대화를 이어갑니다.",
    "career.history.history_oppotunity_info_modal.06bkpp0":
      "저장은 지원이나 프로필 공유가 아닙니다. 관심 표시로만 기록되며, 회사에 회원님 정보가 자동으로 전달되지 않습니다.",
    "career.history.history_oppotunity_info_modal.09mck3y":
      "연결 가능성을 찾아봅니다.",
    "career.history.history_oppotunity_info_modal.0al8ecy":
      "왜 맞는 후보인지, 어떤 경험이 강한지 회사가 이해하기 쉽게 정리합니다.",
    "career.history.history_oppotunity_info_modal.0cqwlx4":
      "이 타입은 회사와의 직접 연결이 먼저 열려 있는 제안은 아닙니다. 관심이 있다면 공식 JD 링크로 이동해 직접 지원하는 방식입니다.",
    "career.history.history_oppotunity_info_modal.0foa5im": "어떤 기회인가요?",
    "career.history.history_oppotunity_info_modal.0ivukr8":
      "필요한 연락 정보를 전달합니다.",
    "career.history.history_oppotunity_info_modal.0kiczm5":
      "하퍼가 회사의 채용 니즈를 확인했고, 회원님과 맞을 가능성이 높다고 판단해 먼저 연결 의사를 묻는 추천입니다. 단순히 웹에서 찾은 JD보다 하퍼가 회사와 직접 이어갈 여지가 큰 기회입니다.",
    "career.history.history_oppotunity_info_modal.0ntn8vq":
      "연결 수락을 누르기 전에는 회사에 회원님 프로필이나 연락처를 전달하지 않습니다. 먼저 회원님이 이 회사와 이야기해볼 의사가 있는지를 확인합니다.",
    "career.history.history_oppotunity_info_modal.0q1p4fw":
      "회사 측이 하퍼를 통해 회원님의 프로필을 보고 직접 연결을 요청한 상태입니다. 일반적인 추천보다 회사의 관심이 먼저 확인된 케이스에 가깝습니다.",
    "career.history.history_oppotunity_info_modal.0xomde1":
      "회원님이 이 회사와 이야기해볼 의사가 있다고 하퍼가 확인합니다.",
    "career.history.history_oppotunity_info_modal.0xzc7b4":
      "회사 측이 바로 연락할 수 있도록 이메일을 중심으로 연결합니다.",
    "career.history.history_oppotunity_info_modal.0y0d6sb":
      "거절하거나 보류해도 괜찮습니다. 선택 결과는 회사 측에는 부담 없는 방식으로 전달하고, 남겨주신 이유는 다음 연결 요청을 더 잘 거르는 데 사용합니다.",
    "career.history.history_oppotunity_info_modal.0zwq8z8":
      "저장한 회사와 하퍼가 연결할 수 있는 경로가 있는지 내부적으로 확인합니다.",
    "career.history.history_oppotunity_info_modal.11hvo3b":
      "어떤 회사, 역할, 문제 유형에 관심이 있는지 다음 추천에 반영합니다.",
    "career.history.history_oppotunity_info_modal.12nroon":
      "추천 기준이 더 선명해집니다.",
    "career.history.history_oppotunity_info_modal.15i7mq0": "연결 수락 이후",
    "career.history.history_oppotunity_info_modal.19qxk26": "연결을 수락하면",
    "career.history.history_oppotunity_info_modal.19yfamm":
      "회사 측 반응, 인터뷰 가능성, 먼저 확인할 조건을 하퍼가 이어서 챙깁니다.",
    "career.history.history_oppotunity_info_modal.1ec32jj":
      "다만 연결을 수락하기 전에는 연락처나 추가 정보가 회사에 전달되지 않습니다. 먼저 회원님의 의사를 확인한 뒤 다음 단계로 넘어갑니다.",
    "career.history.history_oppotunity_info_modal.1fhbkg8":
      "수락 의사를 확인합니다.",
    "career.history.history_oppotunity_info_modal.1g5priu":
      "일정, 역할 범위, 먼저 확인하고 싶은 조건이 있으면 하퍼가 함께 정리합니다.",
    "career.history.history_oppotunity_info_modal.1jhuftr":
      "회원님이 괜찮다고 표시한 뒤에만 회사와의 연결 절차를 시작합니다.",
    "career.history.history_oppotunity_info_modal.1myxm8s":
      "하퍼가 회사 채용 페이지, ATS, 공개 포지션에서 확인한 정보를 바탕으로 선별한 기회입니다. 회원님의 경력, 선호 역할, 근무 조건, 피하고 싶은 선택지를 함께 보고 걸러냅니다.",
    "career.history.history_oppotunity_info_modal.1q6mgg6":
      "수락 의사를 기록합니다.",
    "career.history.history_oppotunity_info_modal.1qug6jy": "어떤 제안인가요?",
    "career.history.history_oppotunity_info_modal.1qugev1":
      "저장하면 하퍼가 활용하는 방식",
    "career.history.history_oppotunity_info_modal.1raav60":
      "회사와 다음 단계를 조율합니다.",
    "career.history.history_oppotunity_info_modal.1tuk6ef":
      "추천 맥락을 정리합니다.",
    "career.history.history_oppotunity_info_modal.1ucb8t9":
      "수락 후에도 마음이 바뀌면 하퍼에게 알려주시면 됩니다. 나와 안맞아요를 누른 경우에는 맞지 않는 이유를 다음 추천에서 비슷한 기회를 줄이는 데 반영합니다.",
    "career.history.history_shortcut_panel.0kgqz9q": "이동",
    "career.history.history_shortcut_panel.1kpvg7d": "이전 포지션",
    "career.history.history_shortcut_panel.1s07tch": "다음 포지션",
    "career.history.opportunity_detail_content.add_memo": "메모 추가하기",
    "career.history.opportunity_detail_content.company_source": "회사 / 출처",
    "career.history.opportunity_detail_content.edit_memo": "메모 수정",
    "career.history.opportunity_detail_content.hide_detail": "상세보기 접기",
    "career.history.opportunity_detail_content.memo": "내 메모",
    "career.history.opportunity_detail_content.show_detail": "상세보기",
    "career.history.opportunity_detail_content.status_menu":
      "{status} 상태 변경",
    "career.history.opportunity_detail_modal.1b2ybel": "새 기회로 되돌리기",
    "career.history.opportunity_detail_modal.aria_label": "{title} 상세",
    "career.history.opportunity_list_card.0l12x89": "주의 요소 :",
    "career.history.opportunity_list_card.status_menu": "{status} 상태 변경",
    "career.history.posting.closed": "지난 공고.",
    "career.history.posting.posted_ago": "{postedAgo}에 게시됨",
    "career.history.saved_opportunity_board.0965oie": "여기에 드롭",
    "career.history.saved_opportunity_board.load_more": "더 불러오기",
    "career.history.saved_opportunity_board.loading_column": "불러오는 중",
    "career.history.saved_opportunity_board.loading_more": "불러오는 중",
    "career.history.saved_opportunity_status.0exoa8f": "보관함",
    "career.history.saved_opportunity_status.0obqas2": "관심 있음",
    "career.history.saved_opportunity_status.1jv953e": "진행 종료",
    "career.history.saved_opportunity_status.all": "전체보기",
    "career.history.saved_opportunity_status.applied": "지원함",
    "career.history.saved_opportunity_status.archived": "제외한 포지션",
    "career.history.saved_opportunity_status.connected": "진행중",
    "career.history.saved_opportunity_status.hide_action": "보관하기",
    "career.home.career_home_panel.024uw9c": "정보 다시 가져오기",
    "career.home.career_home_panel.05hgw7c":
      "왼쪽 채팅에서 혹은 아래 통화로 간단한 질문에만 대답해주세요.",
    "career.home.career_home_panel.0bq7bs7":
      "변경된 사항이 있거나 요구사항이 있을 때 — 통화하면 빨라요",
    "career.home.career_home_panel.0c36lcv":
      "아직 5분 커리어 인터뷰가 완료되지 않았어요",
    "career.home.career_home_panel.0dha8ne": "기준 확인",
    "career.home.career_home_panel.0e3tusc":
      "대화가 끝나면 내용을 정리하고, 딱맞는 기회를 받아보실 수 있게 할게요.",
    "career.home.career_home_panel.0ejjdwp": "{company} 외 {count}개 {status}",
    "career.home.career_home_panel.0f1tq9x":
      "외부 공개 포지션 추천만 받고 있어요. 내부 회사 연결 제안은 꺼져 있어요.",
    "career.home.career_home_panel.0gj76aj": "자료 제출",
    "career.home.career_home_panel.0qe18mm":
      "원하는 기회의 기준을 확인하고 있어요.",
    "career.home.career_home_panel.0rlf0ya":
      "현재 Harper는 새로운 기회를 계속 탐색하고 있습니다.",
    "career.home.career_home_panel.0rplg97": "Harper와 5분 통화",
    "career.home.career_home_panel.0sdf230": "새로 받은 기회",
    "career.home.career_home_panel.0vplw45":
      "정보를 가져오는데 문제가 있었던 것 같습니다.",
    "career.home.career_home_panel.0x7lgjp": "추천된 기회",
    "career.home.career_home_panel.0zkc0rv":
      "오른쪽의 버튼을 통해 다시 시도해주세요. 불편을드려 죄송합니다.",
    "career.home.career_home_panel.11q0oj9": "저장한 포지션",
    "career.home.career_home_panel.15tndog": "추천 시작",
    "career.home.career_home_panel.19aqpg8": "역할과 조건을 짧게 확인",
    "career.home.career_home_panel.1dfqgdw":
      "외부 공개 포지션 추천과 내부 회사 연결 제안이 모두 꺼져 있어요.",
    "career.home.career_home_panel.1dtmpgt":
      "외부 공개 포지션 추천과 내부 회사 연결 제안을 받고 있어요.",
    "career.home.career_home_panel.1frpdtk": "가져오는 중...",
    "career.home.career_home_panel.1jcg4hg":
      "현재 Harper 네트워크에서 {count}개의 기회를 스캔하고 있습니다. 매일매일 더 많은 기회를 발견합니다.",
    "career.home.career_home_panel.1l3sw8y":
      "내부 회사 연결 제안만 받고 있어요. 외부 공개 포지션 추천은 받지 않고 있어요.",
    "career.home.career_home_panel.1ol18h9": "커리어 인터뷰 진행 중",
    "career.home.career_home_panel.1psd54b":
      "아직 저장하거나 연결된 포지션 없음",
    "career.home.career_home_panel.1q70b1u": "계정",
    "career.home.career_home_panel.1qhpcnm": "{count}개 {status}",
    "career.home.career_mobile_home_view.0lny7ac":
      "대화를 통해 회원님을 더 잘 이해하고, 좋아하실만한 기회를 받아보실 수 있게 할게요.",
    "career.home.career_mobile_home_view.0rjturg": "편안한 밤입니다.",
    "career.home.career_mobile_home_view.0snbgwi": "이른 새벽이네요.",
    "career.home.career_mobile_home_view.0t1cxif":
      "필요하신게 있다면 알려주세요.",
    "career.home.career_mobile_home_view.0to563z":
      "채팅에서 혹은 통화로 간단한 질문에만 대답해주세요.",
    "career.home.career_mobile_home_view.0w2aiar": "좋은 하루 보내고 계신가요?",
    "career.home.career_mobile_home_view.1amflsx": "오늘 하루는 어떠셨나요.",
    "career.home.career_mobile_home_view.1inys5s":
      "변경된 사항이 있거나 요구사항이 있을 때<br /> — 통화하면 빨라요",
    "career.home.career_mobile_home_view.1j9mmu9": "좋은 아침입니다.",
    "career.home.career_mobile_home_view.1vip5ub": "저장한 포지션",
    "career.home.career_mobile_home_view.greeting_name_ko":
      "안녕하세요 {name}님",
    "career.home.career_mobile_home_view.summary_count_label":
      "{count}개의 {label}",
    "career.home.loading": "홈 로딩 중",
    "career.internal_opportunity.call_opening":
      "{companyName} {roleTitle} 연결 건으로, 회사에 더 잘 전달할 수 있게 짧게 몇 가지를 확인하고 싶어요.",
    "career.internal_opportunity.call_request_created":
      "추가로, 혹시 저와 짧게 통화 가능하신가요?\n\n평가 목적의 통화는 아니고, {companyName} {roleTitle} 연결 건으로 회사에 더 정확히 소개드리기 위해 역할 관련 질문 몇 가지만 확인하려고 합니다.\n\n- 회사 쪽이 보통 궁금해하는 부분을 짧게 확인할 예정이에요\n- 답변해주시면 소개 자료를 더 구체적으로 만들 수 있어요\n- 통화하지 않으셔도 연결 프로세스는 그대로 진행됩니다\n\n편하실 때 아래에서 바로 진행해주세요.",
    "career.job_posting_recommendations.answer.default_fit_reason":
      "현재 요청과 맞는 업무 범위가 있습니다.",
    "career.job_posting_recommendations.answer.details_label": "조건",
    "career.job_posting_recommendations.answer.empty":
      "지금 조건으로 바로 추천할 만한 external 채용공고를 찾지 못했습니다.\n직무명, 지역, 근무 형태 중 하나를 조금 넓히면 다시 찾아볼 수 있습니다.",
    "career.job_posting_recommendations.answer.requested_count_trimmed":
      "요청하신 {requestedCount}개를 한 번에 모두 보여드리기보다는, 지금은 바로 볼 만한 최대 {finalCount}개만 먼저 골랐습니다. 이후 주기 추천에서는 한 번에 최대 {batchLimit}개씩 더 넓게 찾아보되, 기준에 못 미치는 공고는 넣지 않겠습니다.",
    "career.job_posting_recommendations.answer.saved_headline":
      "요청 조건을 기준으로 현재 우선순위가 높은 {count}개를 포지션 탭에 저장했습니다.",
    "career.job_posting_recommendations.answer.search_intent": "검색 의도",
    "career.job_posting_recommendations.answer.supplemental_included":
      "요청에 바로 맞는 공고가 {directCount}개라서, 완전히 일치하지는 않지만 좋은 공고 {supplementalCount}개를 함께 포함했습니다.",
    "career.job_posting_recommendations.answer.supplemental_reason":
      "현재 요청과 완전히 일치하지는 않지만, 후보군 중 점수가 높아 참고용으로 포함했습니다.",
    "career.job_posting_recommendations.answer.watch_for_label": "확인할 점",
    "career.job_posting_recommendations.answer.why_included_label": "포함 이유",
    "career.job_posting_recommendations.answer.why_it_fits_label": "추천 이유",
    "career.job_posting_recommendations.search_plan.intent_fallback":
      "현재 유저 요청에 맞는 external job posting을 찾는다.",
    "career.onboarding.defer_fallback_close":
      "알겠습니다. 지금 말씀해주신 상황으로 우선 등록을 마쳐둘게요. 나중에 다시 들어오시면 이어서 더 자세히 도와드리겠습니다. 원하시면 아래 버튼으로 지금 바로 계속 대화하셔도 됩니다.",
    "career.onboarding.defer_prompt_text":
      "알겠습니다. 지금은 우선 등록만 마쳐둘게요. 나중에 다시 들어와 주세요.\n\n대신 기본적인 상황만 먼저 알려주시면, 필요할 때 더 빠르게 이어갈 수 있습니다.\n\n현재 어떤 기회를 찾고 있는지 선택해 주세요. 여러 개 선택하셔도 됩니다.",
    "career.onboarding.interest.active_job_search":
      "적극적으로 이직을 찾고 있다.",
    "career.onboarding.interest.not_looking_now":
      "아예 이직 생각이 없고, 나중에 이직 생각이 생기면 다시 와서 알려주겠다.",
    "career.onboarding.interest.open_to_good_opportunities":
      "이직 생각이 크지 않지만 생각하고 있기 때문에 좋은 기회가 있다면 받고 싶다.",
    "career.onboarding.interest.part_time_or_coffee_chat":
      "파트타임/커피챗 등 남는 시간을 활용가능한 기회를 찾고있다.",
    "career.onboarding.interest.selected_prefix": "현재 찾고 있는 기회:",
    "career.onboarding.link.github": "깃헙",
    "career.onboarding.link.linkedin": "링크드인",
    "career.onboarding.link.other": "기타",
    "career.onboarding.link.personal_website": "개인 웹사이트",
    "career.onboarding.linkedin_url_invalid": "올바른 URL이 아닙니다.",
    "career.onboarding.onboarding.010bz98": "이력서 내용을 읽지 못했습니다.",
    "career.onboarding.onboarding.01ywpeo":
      "프로필 공개 설정을 저장하지 못했습니다.",
    "career.onboarding.onboarding.03b3ba6":
      "매칭에 필요한 프로필 정보만 공유돼요. 공개하지 않을 회사를 설정할 수 있어요.",
    "career.onboarding.onboarding.059do1c":
      "프로필 구조화를 시작하지 못했습니다.",
    "career.onboarding.onboarding.06ilxsj":
      "지금 자리는 유지하면서, 병행할 수 있는 일을 찾아요",
    "career.onboarding.onboarding.09uxsj9": "유효한 이메일을 입력해주세요.",
    "career.onboarding.onboarding.0am0h8h": "분석까지 약 2분 걸려요",
    "career.onboarding.onboarding.0cvpvmv": "기회 탐색 시작하기",
    "career.onboarding.onboarding.0czo5rp":
      "커리어에도<br />에이전트가 필요합니다.",
    "career.onboarding.onboarding.0d18cht":
      "이력서나 LinkedIn 링크 중 하나는 꼭 입력해주세요.",
    "career.onboarding.onboarding.0ehh5yz": "이름을 입력해주세요.",
    "career.onboarding.onboarding.0eumq1b": "기본 정보를 저장하지 못했습니다.",
    "career.onboarding.onboarding.0fcepf9": "개인 페이지",
    "career.onboarding.onboarding.0ghhb4f": "Harper가 맞춰서 제안할게요.",
    "career.onboarding.onboarding.0hobsv6": "기회 검색을 시작했습니다.",
    "career.onboarding.onboarding.0j4a2qn": "Harper가 먼저 이해할게요.",
    "career.onboarding.onboarding.0lliiks": "Harper가 먼저 공유해요",
    "career.onboarding.onboarding.0nzlxqj":
      "Harper가 먼저 기회를 가져오고, 내가 확인한 뒤에만 프로필이 공유돼요.",
    "career.onboarding.onboarding.0pijbir":
      "온보딩 세션을 아직 준비하지 못했습니다.",
    "career.onboarding.onboarding.0sc411b":
      "추가 정보는 회원님을 더 이해하는 데 도움이 돼요.",
    "career.onboarding.onboarding.0t0s7bt": "회사에 프로필을 언제 공유할까요?",
    "career.onboarding.onboarding.0w4wbae":
      "찾고 있는 업무 형태를 선택해주세요.",
    "career.onboarding.onboarding.0wbopf1": "다음",
    "career.onboarding.onboarding.0wcgte0": "내가 먼저 확인해요",
    "career.onboarding.onboarding.0wrohr9": "이전",
    "career.onboarding.onboarding.0yf8432": "기본 정보",
    "career.onboarding.onboarding.0yuh7d0": "이력서 업로드에 실패했습니다.",
    "career.onboarding.onboarding.0zapw5l": "프로필 연결",
    "career.onboarding.onboarding.0zc98l7":
      "이제 Harper와 몇 가지 기준만 정하면 돼요.",
    "career.onboarding.onboarding.0zg5btj": "공개 설정",
    "career.onboarding.onboarding.13259px": "바로 검토해볼 만한 풀타임 포지션",
    "career.onboarding.onboarding.13vjc2d": "이력서/CV 업로드",
    "career.onboarding.onboarding.15izros":
      "제대로 된 기회라면 이직도 열어두고 있어요",
    "career.onboarding.onboarding.166o9pn": "풀타임",
    "career.onboarding.onboarding.17aqzmx":
      "LinkedIn 또는 이력서 하나면 충분해요.",
    "career.onboarding.onboarding.17sy1or": "이메일",
    "career.onboarding.onboarding.183d95f":
      "대화 내용은 회사에 공개되지 않아요.",
    "career.onboarding.onboarding.1a74y8o":
      "초기 팀을 돕거나 전략적으로 기여하고 싶어요",
    "career.onboarding.onboarding.1at9nca":
      "잘 맞는 기회라고 판단되면 Harper가 먼저 회사에 프로필을 공유해요. 관심이 오면 바로 알려드려요.",
    "career.onboarding.onboarding.1bulcyv": "어드바이저",
    "career.onboarding.onboarding.1das976":
      "지금 하시는 일과 병행하기 좋은 파트타임/프로젝트 기회",
    "career.onboarding.onboarding.1gr43li": "Harper 시작하기",
    "career.onboarding.onboarding.1gsa1bx":
      "부담 없이 이야기 나눠볼 수 있는 어드바이저 기회",
    "career.onboarding.onboarding.1jkvik4": "대화 시작",
    "career.onboarding.onboarding.1k0o8vf": "파트타임·프로젝트",
    "career.onboarding.onboarding.1kdng2n": "선호 정보를 저장하지 못했습니다.",
    "career.onboarding.onboarding.1n6ukfv":
      "프로필은 선택한 방식대로만 공유돼요.",
    "career.onboarding.onboarding.1njrwx4":
      "이름 (한글 이름의 경우 한글로 적어주세요.)",
    "career.onboarding.onboarding.1o4hblb":
      "시작은 이름과 이메일만 있으면 충분해요.",
    "career.onboarding.onboarding.1p04ixt":
      "온보딩 제출 중 오류가 발생했습니다.",
    "career.onboarding.onboarding.1sh2r2c":
      "온보딩 세션을 불러오지 못했습니다.",
    "career.onboarding.onboarding.1sjsl9m": "정보를 확인했습니다",
    "career.onboarding.onboarding.1sy0934":
      "로그인 정보를 초기화하지 못했습니다.",
    "career.onboarding.onboarding.1t9c061": "어떤 기회를<br />알아보고 있나요?",
    "career.onboarding.onboarding.1wh5aat": "이름",
    "career.onboarding.onboarding.1x0fjwc": "기회 유형",
    "career.onboarding.onboarding.1xpgwgk":
      "PDF, DOCX, 텍스트 파일을 올려주세요. 최대 10MB까지 권장합니다.",
    "career.onboarding.onboarding.default_candidate_name": "회원",
    "career.onboarding.onboarding.official_job_engagement_description":
      "Harper는 확인하신 {jobs} 이외에도 좋은 기회가 보이면 먼저 추천도 드려요. 현재 열려있는 기회를 선택해주세요.",
    "career.onboarding.onboarding.official_job_progress_help":
      "{job} 진행 도와드릴게요.",
    "career.onboarding.onboarding.official_job_visibility_description":
      "{job} 이외의 기회에 대해서도, {name}님을 추천할 수 있어요. 회사에 먼저 소개해도 괜찮다면 먼저 제안을 받아보실 수 있어요.",
    "career.onboarding.onboarding_done.call_cta": "5분 통화하기",
    "career.onboarding.onboarding_done.chat_cta": "채팅으로 하기",
    "career.onboarding.onboarding_done.default_agent_intro":
      "더 좋은 연결을 도와드리기 위해 지금 어떤 상황이신지, 어떤 기회를 원하시는지 몇 가지만 더 여쭤보고 싶어요. 보통 5분 정도면 충분합니다.",
    "career.onboarding.onboarding_done.default_kickoff_profile":
      "이제 제가 맞을 만한 기회들을 찾아보고, 인재 연결을 요청한 회사 중 괜찮은 곳이 있으면 소개 및 연결까지 해드릴게요.",
    "career.onboarding.onboarding_done.default_kickoff_thanks":
      "안녕하세요, 정보를 공유해 주셔서 감사합니다.",
    "career.onboarding.onboarding_done.default_name": "회원",
    "career.onboarding.onboarding_done.default_user_message":
      "제 프로필을 보내드렸어요.",
    "career.onboarding.onboarding_done.default_user_message_short":
      "제 프로필을 보내드렸어요.",
    "career.onboarding.onboarding_done.description":
      "더 좋은 매칭을 위해 현재 상황과 희망하시는 기회에 대해 몇 가지 여쭤보고 싶어요. 솔직하게 답변을 주면 더 좋은 매칭을 해드릴 수 있어요.\n5분 정도면 충분해요.",
    "career.onboarding.onboarding_done.privacy_note":
      "대화 내용은 안전하게 보호되며, 오직 {name}님의 더 나은 커리어 기회를 찾는 데에만 활용돼요.",
    "career.onboarding.onboarding_done.ready_badge": "대화 준비 완료",
    "career.onboarding.onboarding_done.selected_agent_intro":
      "대화가 끝나면 {targetCopy}부터 찾아보고, 소개와 연결도 도와드릴게요.",
    "career.onboarding.onboarding_done.title": "잠깐 커피챗 가능할까요?",
    "career.onboarding.onboarding_loading_state.0hhyibm":
      "첫 대화를 준비하고 있어요",
    "career.onboarding.onboarding_loading_state.0ouyje6":
      "LinkedIn과 이력서에서 배경과 경험을 확인하고 있습니다.",
    "career.onboarding.onboarding_loading_state.19pgngy":
      "프로필을 읽고 있어요",
    "career.onboarding.onboarding_loading_state.1p92fsi":
      "강점 신호를 찾고 있어요",
    "career.onboarding.onboarding_loading_state.analyzing_badge":
      "Harper가 분석 중이에요",
    "career.onboarding.onboarding_loading_state.footer_note":
      "분석까지 약 1분 걸려요. 하퍼가 좋은 추천을 할 수 있도록 조금만 기다려주세요.",
    "career.onboarding.onboarding_loading_state.preview_label":
      "온보딩 분석 진행 상태",
    "career.onboarding.onboarding_loading_state.profile_context":
      "경력과 관심사를 파악하고 있어요",
    "career.onboarding.submit.resume_or_link_required":
      "이력서나 주요 링크 중 하나는 꼭 입력해주세요.",
    "career.onboarding.submitted.link_part_many": "{labels} 링크",
    "career.onboarding.submitted.link_part_one": "{labels} 링크",
    "career.onboarding.submitted.links_only": "{linkPart}를 제출했습니다.",
    "career.onboarding.submitted.profile_information":
      "프로필 정보를 제출했습니다.",
    "career.onboarding.submitted.resume_and_links":
      "이력서와 {linkPart}를 제출했습니다.",
    "career.onboarding.submitted.resume_only": "이력서를 제출했습니다.",
    "career.preview.career_workspace_preview.01j68q1":
      "미국 기반 B2B SaaS 팀으로, 초기 AI 기능을 제품 핵심으로 전환하고 있습니다.",
    "career.preview.career_workspace_preview.022alch":
      "온보딩이 끝났어요. 지금은 어떤 기회를 가장 우선해서 보고 싶으세요?",
    "career.preview.career_workspace_preview.045qelm":
      "멀티모달 모델 평가 파이프라인과 배포 시스템을 만드는 역할입니다.",
    "career.preview.career_workspace_preview.04a6xnr":
      "미리보기 화면입니다. 실제 연동에서는 인터뷰를 종료하고 대화 요약 카드만 여기에 렌더링합니다.",
    "career.preview.career_workspace_preview.051gu06":
      "작은 팀에서 제품 방향과 기술 의사결정을 함께 가져갈 수 있습니다.",
    "career.preview.career_workspace_preview.05bnk2r":
      "이력서와 링크를 저장했습니다.",
    "career.preview.career_workspace_preview.05fo2rr":
      "초기 시스템 설계와 품질 기준 수립 경험을 바로 활용할 수 있습니다.",
    "career.preview.career_workspace_preview.05gbt68":
      "추천 모델과 conversational UX를 제품 조직과 함께 리드하는 포지션입니다.",
    "career.preview.career_workspace_preview.0gdmtk0":
      "좋아요. 서울, Remote, SF까지 열어두고 applied AI와 agent product 중심으로 좁혀볼게요.",
    "career.preview.career_workspace_preview.0hhw3xx":
      "논문 기반 평가 시스템 경험이 직접적으로 이어집니다.",
    "career.preview.career_workspace_preview.0kof53s":
      "반영했어요. 연결 가능한 내부 기회와 공개 포지션을 함께 보고, fit이 강한 것부터 먼저 정리해둘게요.",
    "career.preview.career_workspace_preview.0kxr9jl":
      "커머스 검색과 개인화 모델을 제품 KPI에 직접 연결하는 팀입니다.",
    "career.preview.career_workspace_preview.0ng3mak": "0 to 1 제품 론치 경험",
    "career.preview.career_workspace_preview.0o0xl6w":
      "프로필 설정을 저장했습니다.",
    "career.preview.career_workspace_preview.0occyrr":
      "제품 오너십은 높지만 도메인 자체 선호가 갈릴 수 있습니다.",
    "career.preview.career_workspace_preview.0r19bht":
      "작은 팀에서 제품과 모델 품질을 함께 책임질 수 있는 역할입니다.",
    "career.preview.career_workspace_preview.0r259wt":
      "LLM 제품 론치 경험이 직접적으로 연결됩니다.",
    "career.preview.career_workspace_preview.0wa8f7a":
      "작은 팀이어도 제품 방향과 기술 의사결정이 빠른 곳을 선호합니다. 의미 없는 AI 포장보다는 실제 사용량이 있는 제품이면 좋겠습니다.",
    "career.preview.career_workspace_preview.10x4rht":
      "논문과 프로덕트 사이를 잇는 applied research 조직입니다.",
    "career.preview.career_workspace_preview.12a8e6s":
      "대화형 agent 제품을 설계하고, retrieval / evaluation / observability 파이프라인을 구축했습니다.",
    "career.preview.career_workspace_preview.18ymrj7":
      "LLM workflow와 evaluation 체계를 만들고, 엔지니어링 팀과 함께 고객 기능을 빠르게 실험하는 포지션입니다.",
    "career.preview.career_workspace_preview.19hvkft":
      "Remote 선호와 제품 중심 applied AI 경험이 잘 맞습니다.",
    "career.preview.career_workspace_preview.19k8ud9":
      "정규직이 우선이고, 강한 fit이면 fractional advisory도 괜찮아요.",
    "career.preview.career_workspace_preview.19rh5dl":
      "데이터 파이프라인과 internal tooling을 개발하며 제품팀과 협업했습니다.",
    "career.preview.career_workspace_preview.1ashy8n":
      "Harper insight를 저장했습니다.",
    "career.preview.career_workspace_preview.1b3wco5":
      "research와 product의 중간 지점 역할을 선호하는지 확인이 필요한 기회입니다.",
    "career.preview.career_workspace_preview.1bdgvh5":
      "저장된 이력서/링크에서 정보를 다시 가져왔습니다.",
    "career.preview.career_workspace_preview.1c9yhl3":
      "LLM 제품을 실제 사용자와 맞닿은 환경에 배포하는 일을 주로 해왔고, 모델 품질과 제품 속도를 같이 관리하는 역할을 선호합니다.",
    "career.preview.career_workspace_preview.1dkij5s":
      "미리보기 화면입니다. 실제 연동에서는 이 입력이 서버 대화와 이어집니다.",
    "career.preview.career_workspace_preview.1gp8ljf":
      "작은 제품팀에서 모델 품질과 사용자 경험을 같이 책임지는 팀입니다.",
    "career.preview.career_workspace_preview.1hcvc0e":
      "사용자와 맞닿은 AI 제품을 빠르게 배포하고, 모델 성능과 제품 UX 사이의 균형을 설계하는 역할을 주로 맡아왔습니다.",
    "career.preview.career_workspace_preview.1ist4od":
      "초기 제품 방향과 LLM workflow를 같이 설계할 수 있는 포지션입니다.",
    "career.preview.career_workspace_preview.1j2um38":
      "글로벌 AI 제품팀에서 지금보다 보상과 책임이 큰 역할을 먼저 보고 싶어요.",
    "career.preview.career_workspace_preview.1nzus3x":
      "프로덕트 팀과 바로 붙어 agent 기능을 제품에 배포하고 운영 지표까지 같이 보는 역할입니다.",
    "career.preview.career_workspace_preview.1rsjscm":
      "말씀해주신 조건들을 Harper의 검색 기준에 반영했어요. 결과는 포지션 탭과 이메일로 준비되는 대로 보내드릴 거예요. 최대 1시간 정도 걸릴 수 있어요. 확인하신 뒤에는 좋아요/싫어요를 눌러주시고, 마음에 드는 회사는 track 해두시면 관련 소식이나 채용 업데이트를 챙겨드릴게요. 한 가지만 여쭤볼게요. 선호하실 만한 기회라면 제가 연결 가능한 기회가 아닌 외부 공고라도 주기적으로 알려드리면 좋을까요? 아니면 내부 연결처럼 특히 핏이 강한 기회가 있을 때만 연락드리는 쪽이 편하실까요?",
    "career.preview.career_workspace_preview.1tenwz4":
      "LLM eval 도구와 agent workflow 패키지 유지보수",
    "career.preview.career_workspace_preview.1truxm7": "프로필을 저장했습니다.",
    "career.profile.career_profile_menu.0rpl24h": "프로필 메뉴",
    "career.profile.career_profile_menu.1k7ppv0": "로그아웃",
    "career.profile.career_profile_menu.1vjbdm5": "문의하기",
    "career.profile.career_profile_settings_section.07836ex": "추가",
    "career.profile.career_profile_settings_section.08zy6at": "저장 중...",
    "career.profile.career_profile_settings_section.08zy6at_2": "저장 중...",
    "career.profile.career_profile_settings_section.09ffo10":
      "프로필 공개 설정을 바꿀까요?",
    "career.profile.career_profile_settings_section.0fc879w":
      "프로필 공개 저장 중",
    "career.profile.career_profile_settings_section.0jiry9t": "취소",
    "career.profile.career_profile_settings_section.0o48hts": "차단 기업",
    "career.profile.career_profile_settings_section.0on2o51": "되돌리기",
    "career.profile.career_profile_settings_section.0vrogtc":
      "먼저 매칭된 기회/회사를 확인한 뒤 직접 허용한 경우에만 익명 프로필이 공유됩니다.",
    "career.profile.career_profile_settings_section.10tme3s":
      "회사명을 입력하고 Enter",
    "career.profile.career_profile_settings_section.117d7sb":
      "Don't share로 바꾸면 모든 추천 및 연결이 중지됩니다. 이미 연결된 기회에 대해서도 회사가 프로필을 볼 수 없게 차단합니다. 서비스를 잠시 중단하고 싶다면 이 옵션을 선택해주세요.",
    "career.profile.career_profile_settings_section.13fr2yp":
      "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유하고, 구체적인 제안을 받으신 뒤 판단하실 수 있도록 합니다.",
    "career.profile.career_profile_settings_section.140kczj":
      "Open to matches로 바꾸면 양측이 선호할 기회라고 판단될 때 Harper가 회사에 먼저 회원님을 제안할 수 있습니다. 이 경우 회사가 먼저 제안을 해오기 때문에 구체적인 제안을 받은 뒤 수락할지말지 결정하실 수 있고, 수락시 100% 연결됩니다.<br /><br />모든 정보가 공개되지 않고 회사 측에서 판단에 필요한 정보만 Harper가 제한적으로 공유합니다.<br />모든 회사가 공유되지 않고 Harper가 회원님이 선호하실 것 같은 기회라고 판단한 경우에만 공유합니다. 직접 등록한 차단 회사에는 절대로 공유되지 않습니다.",
    "career.profile.career_profile_settings_section.18i3x5x": "설정 저장",
    "career.profile.career_profile_settings_section.1easkuh":
      "절대 어떤 경우에도 프로필이 공유되지 않습니다. 잠시 모든 매칭을 차단하고 싶다면 이 옵션을 선택해주세요.",
    "career.profile.career_profile_settings_section.1fz4zad":
      "이 설정에 따라 나의 프로필이 전달되는 조건이 달라집니다.",
    "career.profile.career_profile_settings_section.1izc5gu":
      "Exceptional only로 바꾸면 먼저 기회나 회사를 확인하고 내가 허용한 경우에만 프로필이 공유됩니다. 절대로 내가 확인하지 않은 회사/역할에 대해 내 정보가 공유되지 않습니다.",
    "career.profile.career_profile_settings_section.1kggtpw":
      "차단 기업 저장 중",
    "career.profile.career_profile_settings_section.1mx38an": "확인하고 저장",
    "career.profile.career_profile_settings_section.1mzsli6":
      "차단된 회사가 없습니다.",
    "career.profile.career_profile_settings_section.1qqh6ja": "불러오는 중",
    "career.profile.career_profile_settings_section.1tnqucg": "프로필 공개",
    "career.profile.career_profile_settings_section.1z04ms5":
      "변경하려는 공개 범위",
    "career.profile.career_profile_settings_section.engagement_advisor":
      "전략적·기술적 자문 역할도 검토할 수 있어요.",
    "career.profile.career_profile_settings_section.engagement_fractional":
      "현업을 유지하면서 파트타임·프로젝트 형태로 참여할 수 있어요.",
    "career.profile.career_profile_settings_section.engagement_full_time":
      "정규직/풀타임 역할까지 열려 있어요.",
    "career.profile.career_profile_settings_section.engagement_types_hint":
      "지금 열려있는 기회를 모두 선택해주세요.",
    "career.profile.career_profile_settings_section.engagement_types_label":
      "관심 기회 형태",
    "career.profile.career_profile_settings_section.remove_blocked_company":
      "{companyName} 삭제",
    "career.profile.career_profile_workspace.0pv1jmq":
      "저장된 이력서가 없습니다",
    "career.profile.career_profile_workspace.116ofw4":
      "이대로 회사 측에 전달되지는 않지만, 변경하고 싶으신 사항이 있는지 확인할 수 있습니다.",
    "career.profile.career_profile_workspace.11os0vs":
      "이력서와 나와 관련된 링크를 확인하고 수정할 수 있습니다.",
    "career.profile.career_profile_workspace.14bifvm": "이력서/링크",
    "career.profile.career_profile_workspace.16e35ps":
      "입력하신 정보와 대화내용을 바탕으로 Harper가 구성한 프로필입니다.",
    "career.profile.career_talent_profile_panel.00infjs": "근무 지역",
    "career.profile.career_talent_profile_panel.04441vu":
      "로고 이미지는 5MB 이하로 업로드해 주세요.",
    "career.profile.career_talent_profile_panel.051qjyj": "주요 업무와 성과",
    "career.profile.career_talent_profile_panel.05hwq9n": "프로필 사진 메뉴",
    "career.profile.career_talent_profile_panel.06cga7b": "필수 조건",
    "career.profile.career_talent_profile_panel.06x2f2q": "전공",
    "career.profile.career_talent_profile_panel.07tjd6q": "설명",
    "career.profile.career_talent_profile_panel.07x414y": "회사 링크",
    "career.profile.career_talent_profile_panel.093jpik": "아직 확인 중",
    "career.profile.career_talent_profile_panel.0a2iqu6": "로고 이미지 업로드",
    "career.profile.career_talent_profile_panel.0a7k434": "학위",
    "career.profile.career_talent_profile_panel.0acdx91":
      "로고 업로드에 실패했습니다.",
    "career.profile.career_talent_profile_panel.0anxi5z":
      "이미지 파일만 업로드할 수 있습니다.",
    "career.profile.career_talent_profile_panel.0csjlpy": "지역",
    "career.profile.career_talent_profile_panel.0efzyx5": "경력 추가",
    "career.profile.career_talent_profile_panel.0p5h1wt": "현재",
    "career.profile.career_talent_profile_panel.0q45tnt":
      "아직 저장된 프로필 내용이 없습니다. 수정하기를 눌러 직접 입력할 수 있습니다.",
    "career.profile.career_talent_profile_panel.0qip38b": "회피 조건",
    "career.profile.career_talent_profile_panel.0rfzx4s":
      "· 연결이 성사된 회사에만 공유돼요",
    "career.profile.career_talent_profile_panel.0rtdf2n": "고용 형태",
    "career.profile.career_talent_profile_panel.0seo81b":
      "프로필 사진 저장에 실패했습니다.",
    "career.profile.career_talent_profile_panel.0tc2iu5":
      "프로필 사진 삭제에 실패했습니다.",
    "career.profile.career_talent_profile_panel.0tftkys": "접기",
    "career.profile.career_talent_profile_panel.0tgcq59": "한 줄 소개",
    "career.profile.career_talent_profile_panel.0uwqvnk": "회사명",
    "career.profile.career_talent_profile_panel.0wjximy": "추가 정보",
    "career.profile.career_talent_profile_panel.0x0us78":
      "경력, 학력, 추가 정보를 추가해 주세요.",
    "career.profile.career_talent_profile_panel.0x4dx7a": "저장하기",
    "career.profile.career_talent_profile_panel.11cor6u": "시작일",
    "career.profile.career_talent_profile_panel.13a39zc": "종료일",
    "career.profile.career_talent_profile_panel.18od9kw": "항목 삭제",
    "career.profile.career_talent_profile_panel.19jif2e": "보상",
    "career.profile.career_talent_profile_panel.1afhauj": "학교명",
    "career.profile.career_talent_profile_panel.1axs5u2": "다음 역할",
    "career.profile.career_talent_profile_panel.1d7d70h": "Harper 메모",
    "career.profile.career_talent_profile_panel.1dp84h2": "사진 삭제",
    "career.profile.career_talent_profile_panel.1dup23s":
      "프로필 이미지는 5MB 이하로 업로드해 주세요.",
    "career.profile.career_talent_profile_panel.1efofsl": "학력 추가",
    "career.profile.career_talent_profile_panel.1gsvvpp":
      "프로필 사진 업로드에 실패했습니다.",
    "career.profile.career_talent_profile_panel.1iegi7w": "종료일 또는 현재",
    "career.profile.career_talent_profile_panel.1iq5xym": "수정하기",
    "career.profile.career_talent_profile_panel.1nc9ehf": "전체 insight 보기",
    "career.profile.career_talent_profile_panel.1pzl6hl": "날짜",
    "career.profile.career_talent_profile_panel.1qnltk8": "직무",
    "career.profile.career_talent_profile_panel.1rnsexk": "사진 변경/업로드",
    "career.profile.career_talent_profile_panel.1syy18d": "기타",
    "career.profile.career_talent_profile_panel.1trcux2": "학력 설명",
    "career.profile.career_talent_profile_panel.1u4ajdw": "기간 자동 계산",
    "career.profile.career_talent_profile_panel.1ub2ks6": "제목",
    "career.profile.career_talent_profile_panel.1ywstxy": "학교/프로그램 링크",
    "career.profile.date.present": "현재",
    "career.profile.date.year_only": "{year}년",
    "career.profile.duration.month_many": "{months}개월",
    "career.profile.duration.month_one": "{months}개월",
    "career.profile.duration.year_many_month_many": "{years}년 {months}개월",
    "career.profile.duration.year_many_month_one": "{years}년 {months}개월",
    "career.profile.duration.year_many_month_zero": "{years}년 0개월",
    "career.profile.duration.year_one_month_many": "{years}년 {months}개월",
    "career.profile.duration.year_one_month_one": "{years}년 {months}개월",
    "career.profile.duration.year_one_month_zero": "{years}년 0개월",
    "career.profile.language_selector.close": "닫기",
    "career.profile.language_selector.menu_label": "언어 설정",
    "career.profile.language_selector.modal_description":
      "Harper가 사용할 언어를 선택하세요.",
    "career.profile.language_selector.modal_title": "언어 설정",
    "career.profile.language_selector.save_failed":
      "언어 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    "career.profile.recruiter_profile.default": "채용 담당자가 보는 프로필",
    "career.profile.recruiter_profile.named":
      "채용 담당자가 보는 {name}의 프로필",
    "career.profile.resume_links.linkedin_refresh_label":
      "링크드인 정보 새로고침",
    "career.profile.resume_links.linkedin_refresh_tooltip":
      "업데이트된 링크드인 정보를 가져옵니다.",
    "career.profile.settings.no_saved_changes":
      "아직 저장된 변경 이력이 없습니다.",
    "career.recommend_job_postings.chat_preamble":
      "좋습니다. 지금까지의 대화와 피드백을 기준으로 새 포지션을 찾아볼게요.",
    "career.referral.footer.invite_friends": "친구 초대하기",
    "career.referral.intro_test.greeting":
      "{candidateName}님, Harper를 소개드릴게요.",
    "career.referral.intro_test.reward_disclosure":
      "제가 Harper referral 프로그램을 통해 소개하면, 후보자님이 동의하고 추후 채용까지 이어지는 경우 저에게 보상이 지급될 수 있습니다.",
    "career.referral.intro_test.service_description":
      "Harper는 후보자 편에서 커리어 기회를 검토하고 회사 연결을 도와주는 서비스입니다.",
    "career.referral.intro_test.subject": "소개: {candidateEmail} <> Harper",
    "career.referral.intro_test.team_note":
      "Harper team, {candidateName}님께 직접 동의 여부를 확인해주세요.",
    "career.referral.menu.invite": "초대하기",
    "career.referral.modal.aria_label": "Harper 초대하기",
    "career.referral.modal.average_reward": "평균 300만원",
    "career.referral.modal.copied": "복사됨",
    "career.referral.modal.copy": "복사",
    "career.referral.modal.copy_invite_message": "문구 복사",
    "career.referral.modal.description":
      "내가 공유한 링크를 통해 가입한 사람이 Harper를 통해 채용되면 보상을 받을 수 있습니다.",
    "career.referral.modal.error_referral_list_load_failed":
      "초대 목록을 불러오지 못했습니다.",
    "career.referral.modal.error_reward_list_load_failed":
      "채용 및 보상 현황을 불러오지 못했습니다.",
    "career.referral.modal.error_summary_load_failed":
      "초대 정보를 불러오지 못했습니다.",
    "career.referral.modal.example_basis": "연봉 1억원 채용 1건 기준",
    "career.referral.modal.example_review_note": "이해를 돕기 위한 예시",
    "career.referral.modal.example_reward": "200만원 ~ 400만원",
    "career.referral.modal.example_reward_heading": "예시 보상",
    "career.referral.modal.example_salary": "1억원",
    "career.referral.modal.first_year_salary_label": "첫해 연봉",
    "career.referral.modal.hiring_confirmed": "확정",
    "career.referral.modal.hiring_not_confirmed": "미확정",
    "career.referral.modal.hiring_reward_empty":
      "아직 채용 및 보상 현황이 없습니다.",
    "career.referral.modal.hiring_reward_heading": "채용 및 보상 현황",
    "career.referral.modal.hiring_reward_summary":
      "채용이 확정되어 보상 절차가 진행 중인 내역",
    "career.referral.modal.how_it_works": "진행 방식",
    "career.referral.modal.invite_message":
      "안녕하세요, 커리어 기회를 살펴볼 때 Harper가 도움이 될 것 같아 공유드려요.\n\nHarper는 대화를 통해 지금까지의 경험과 다음 커리어에서 원하는 점을 파악하고, 잘 맞을 만한 회사와 역할을 찾아 소개해주는 서비스예요. 당장 이직할 계획이 없어도 가볍게 대화를 시작해볼 수 있습니다.\n\n궁금하면 아래 링크에서 확인해보세요.\n{link}",
    "career.referral.modal.invite_message_description":
      "내 초대 링크가 자동으로 들어갑니다. 그대로 복사하거나 상대방에 맞게 다듬어 보내세요.",
    "career.referral.modal.invite_message_heading": "함께 보낼 소개 문구",
    "career.referral.modal.invite_message_link_placeholder": "[초대 링크]",
    "career.referral.modal.latest_hire_reward":
      "Harper의 가장 최근 채용건의 보상금: 1,000만원 (초대를 통한 가입으로 가정했을 때)",
    "career.referral.modal.link_loading": "초대 링크를 준비하는 중입니다.",
    "career.referral.modal.read_terms": "전체 약관 보기",
    "career.referral.modal.referral_headline_empty": "프로필 소개 없음",
    "career.referral.modal.referral_hired": "채용됨",
    "career.referral.modal.referral_name_empty": "Harper 사용자",
    "career.referral.modal.referral_not_hired": "가입 완료",
    "career.referral.modal.referrals_heading": "초대 목록",
    "career.referral.modal.referrals_load_more": "더 보기",
    "career.referral.modal.referrals_summary":
      "지금까지 {count}명이 내 링크로 가입했습니다.",
    "career.referral.modal.referrals_summary_singular":
      "지금까지 1명이 내 링크로 가입했습니다.",
    "career.referral.modal.referrals_table_candidate": "이름",
    "career.referral.modal.referrals_table_headline": "프로필 소개",
    "career.referral.modal.referrals_table_joined_at": "가입일",
    "career.referral.modal.referrals_table_status": "상태",
    "career.referral.modal.retry": "다시 시도",
    "career.referral.modal.reward_description":
      "추천한 사람이 Harper를 통해 채용되면 첫해 연봉, 계약 조건, Harper가 실제로 수령한 채용 수수료의 20%를 기준으로 보상을 검토합니다.",
    "career.referral.modal.reward_fee_basis":
      "보상은 회사에서 Harper에게 제공하는 채용 수수료를 기준으로, 연봉과 계약 조건에 따라 달라질 수 있습니다.",
    "career.referral.modal.reward_fee_rate": "(수수료의 20%)",
    "career.referral.modal.reward_heading": "추천 보상",
    "career.referral.modal.reward_headline":
      "지인의 이직 한 번에 최대 1,000만원의 보상금을 드립니다.",
    "career.referral.modal.reward_not_paid": "지급 예정",
    "career.referral.modal.reward_note":
      "실제 보상은 약관상 유효 추천 여부와 채용·정산 조건에 따라 달라질 수 있습니다.",
    "career.referral.modal.reward_paid": "지급 완료",
    "career.referral.modal.reward_range": "250만원 ~ 1000만원",
    "career.referral.modal.reward_table_amount": "금액",
    "career.referral.modal.reward_table_candidate": "이름",
    "career.referral.modal.reward_table_due_at": "보상지급 예정일",
    "career.referral.modal.reward_table_hired": "채용 확정 여부",
    "career.referral.modal.reward_table_paid": "보상지급완료여부",
    "career.referral.modal.reward_unlimited_description":
      "여러 명이 Harper를 통해 여러 번 이직하면, 각 채용 건마다 보상을 검토합니다.",
    "career.referral.modal.reward_unlimited_heading":
      "보상 지급 횟수에 제한은 없습니다.",
    "career.referral.modal.share": "공유",
    "career.referral.modal.share_link_description":
      "링크를 복사한 뒤 아래 소개 문구와 함께 보내면 상대방이 Harper를 이해하기 쉽습니다.",
    "career.referral.modal.share_link_heading": "초대 링크 공유",
    "career.referral.modal.share_text":
      "Harper에서 커리어 기회를 함께 찾아보세요.",
    "career.referral.modal.share_title": "Harper 초대",
    "career.referral.modal.stats_heading": "내 초대 현황",
    "career.referral.modal.stats_hires": "채용 확정",
    "career.referral.modal.stats_note":
      "방문 수는 중복 제거 등의 이유로 조정될 수 있습니다. 초대 목록에는 가입한 사람의 기본 프로필과 채용 여부만 표시되며, 회사명이나 상세 채용 진행은 공개되지 않습니다.",
    "career.referral.modal.stats_paid": "비용 지급됨",
    "career.referral.modal.stats_signups": "회원가입",
    "career.referral.modal.stats_visits": "링크 방문",
    "career.referral.modal.step1_description":
      "Harper가 도움이 될 만한 친구나 동료에게 초대 링크와 소개 문구를 보내세요.",
    "career.referral.modal.step1_title": "소개할 사람에게 링크를 전달합니다.",
    "career.referral.modal.step2_description":
      "상대방이 가입할 때 사용한 추천 링크를 기준으로 내 초대 기록에 반영됩니다.",
    "career.referral.modal.step2_title": "상대방이 링크로 가입합니다.",
    "career.referral.modal.step3_description":
      "Harper를 통한 채용과 고객사 정산이 확인되면 약관에 따라 보상금을 지급합니다.",
    "career.referral.modal.step3_title": "채용되면 보상을 받을 수 있습니다.",
    "career.referral.modal.title": "주변 사람에게 Harper를 소개하세요",
    "career.referral.modal.toast_invite_message_copied":
      "소개 문구가 복사되었습니다.",
    "career.referral.modal.toast_invite_message_copy_failed":
      "소개 문구 복사에 실패했습니다.",
    "career.referral.modal.toast_link_copied": "초대 링크가 복사되었습니다.",
    "career.referral.modal.toast_link_copy_failed": "링크 복사에 실패했습니다.",
    "career.referral.modal.top_open_roles": "현재 열려 있는 주요 포지션",
    "career.referral.modal.top_open_roles_more": "그 외",
    "career.referral.modal.updating": "업데이트 중",
    "career.referral.modal.your_cut_label": "산정 기준",
    "career.referral.modal.your_cut_value": "Harper에게 지급되는 수수료의 20%",
    "career.referral.modal.your_reward_label": "내 보상",
    "career.referral.network.toast_email_invalid":
      "유효한 이메일을 입력해 주세요.",
    "career.referral.network.toast_email_required": "이메일을 입력해 주세요.",
    "career.referral.network.toast_link_copy_failed":
      "링크 복사에 실패했습니다.",
    "career.referral.network.toast_share_link_copied":
      "공유 링크가 복사되었습니다.",
    "career.referral.network.toast_share_link_create_failed":
      "공유 링크 생성에 실패했습니다.",
    "career.referral.network.toast_visit_capture_failed":
      "공유 유입 기록에 실패했습니다.",
    "career.referral.network_share_modal.close": "닫기",
    "career.referral.network_share_modal.close_aria": "공유 모달 닫기",
    "career.referral.network_share_modal.create_link": "공유 링크 생성",
    "career.referral.network_share_modal.creating": "생성 중...",
    "career.referral.network_share_modal.email_label": "이메일",
    "career.referral.network_share_modal.title": "공유 링크 생성",
    "career.resume_dropzone.drag_description":
      "파일을 놓아 이력서를 선택하세요.",
    "career.resume_dropzone.drag_title": "여기에 놓으면 업로드됩니다",
    "career.resume_dropzone.empty_title": "이력서를 끌어다 놓거나 선택하세요",
    "career.resume_dropzone.selected_description":
      "다른 파일로 바꾸려면 클릭하거나 다시 드롭하세요.",
    "career.resume_dropzone.settings_description":
      "PDF, DOCX, TXT, MD 파일을 업로드할 수 있습니다.",
    "career.resume_dropzone.settings_selected_description":
      "저장 버튼을 누르면 이 파일로 업데이트됩니다.",
    "career.resume_dropzone.unsupported_file":
      "지원하는 이력서 파일 형식만 업로드해 주세요.",
    "career.settings.career_settings_modal.0858bd9":
      "탈퇴하면 계정과 커리어 프로필, 이력서, 대화/추천 데이터가 삭제됩니다. 다시 되돌릴 수 없습니다.",
    "career.settings.career_settings_modal.0j4pj4h": "회원 탈퇴를 진행할까요?",
    "career.settings.career_settings_modal.0jiry9t": "취소",
    "career.settings.career_settings_modal.0poe6eq": "뒤로",
    "career.settings.career_settings_modal.0tdjt8e": "프로필 설정",
    "career.settings.career_settings_modal.0tel9h5": "탈퇴하기",
    "career.settings.career_settings_modal.0zjg8a0": "로그인 중",
    "career.settings.career_settings_modal.11hatjy": "커리어 설정",
    "career.settings.career_settings_modal.11q4o0j": "회원 탈퇴 확인 닫기",
    "career.settings.career_settings_modal.1338q8i": "설정",
    "career.settings.career_settings_modal.16x7oad": "설정 닫기",
    "career.settings.career_settings_modal.18qhozv":
      "아래로 드래그하면 메뉴 크기로 축소되고, 위로 드래그하면 전체화면으로 확장됩니다.",
    "career.settings.career_settings_modal.1b7saeu":
      "회원 탈퇴 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    "career.settings.career_settings_modal.1ba4567": "회원 탈퇴",
    "career.settings.career_settings_modal.1hdokry":
      "삭제된 데이터는 복구할 수 없습니다.",
    "career.settings.career_settings_modal.1lbfn2i": "계정 관리",
    "career.settings.career_settings_modal.1stwtug":
      "탈퇴하면 계정 접근 권한, 커리어 프로필, 이력서, 대화 기록, 추천/설정 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.",
    "career.settings.career_settings_modal.1u81q4e": "내 이력서/링크",
    "career.settings.career_settings_modal.1vcdzyt":
      "계정 세션과 가입 상태를 관리합니다.",
    "career.settings.career_settings_modal.1vqjolg": "탈퇴 처리 중",
    "career.settings.career_settings_modal.keep_account": "계정 유지하기",
    "career.tool_policy.acknowledgement_example":
      "알겠습니다. 앞으로 이 조건을 기준으로 맞는 기회를 찾아볼게요.",
    "ui.1787f9e": "한국어",
  },
} as const;
