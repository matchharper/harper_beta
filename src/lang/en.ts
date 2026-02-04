export const en = {
  auth: {
    login: "Log in",
    signup: "Sign up",
    continueWithGoogle: "Continue with Google",
    confirmPassword: "Confirm password",
    emailConfirmationSent: "We've sent a confirmation email. Please check your inbox.",
    invalidAccount: "Account not found.",
  },
  invitation: {
    title: "Please enter your code.",
    description:
      "Harper is currently in private beta. Enter your invite code below.\nIf you need a code, join the waitlist.",
    placeholder: "Invite code",
    submit: "Enter",
    divider: "OR",
    waitlist: "Join waitlist",
    contact: "Contact us",
    errors: {
      emptyCode: "Please enter the invite code.",
      invalidCode: "Invite code doesn't match.",
    },
  },
  join: {
    roles: {
      recruiter: "Professional Recruiter",
      options: [
        "Professional Recruiter",
        "CEO",
        "Hiring Manager",
        "CTO",
        "HR Manager",
        "Team Lead",
        "Engineer",
        "Other",
      ],
    },
    sizes: [
      "1-10",
      "11-50",
      "51-100",
      "101-200",
      "201-500",
      "501+",
    ],
    steps: {
      contact: {
        title: "Please share your name and email.",
        description: "",
      },
      role: {
        title: "What is your role at the company?",
        description: "",
      },
      company: {
        title: "Please share your company name and website.",
        description: "(Website is optional.)",
      },
      companyRecruiter: {
        title: "Please share your agency name and website.",
        description: "(Website is optional.)",
      },
      size: {
        title: "How large is your company (total headcount)?",
        description: "",
      },
      needs: {
        title:
          "Tell us the most important roles you need to hire for and the approximate headcount.",
        description: "optional",
      },
      additional: {
        title:
          "Share anything else you'd like Harper to know, or hiring challenges you're facing.",
        description: "optional",
      },
      additionalRecruiter: {
        title:
          "Share anything else you'd like Harper to know, or the key need you want solved.",
        description: "optional",
      },
    },
    fields: {
      nameLabel: "Name",
      namePlaceholder: "Name",
      emailLabel: "Email",
      emailPlaceholder: "example@company.com",
      companyLabel: "Company name",
      companyPlaceholder: "e.g. Harper",
      companyLinkLabel: "Website URL",
      companyLinkPlaceholder: "e.g. https://matchharper.com",
      needsPlaceholder:
        "e.g. 2 Machine Learning Engineers, 1 Deep Learning Researcher",
      additionalPlaceholder:
        "e.g. Hiring is urgent and we need guidance on evaluating candidates.",
    },
    actions: {
      submit: "Submit",
      next: "Next",
      back: "Back",
      press: "press",
      enter: "Enter",
      saving: "Saving...",
    },
    done: {
      title: "You're all set.",
      description:
        "Harper is preparing to introduce the best candidates for your team.\nWe'll reach out soon.",
      backToCompanies: "Go back",
    },
    validation: {
      nameRequired: "Please enter your name.",
      emailRequired: "Please enter your email.",
      emailInvalid: "Please enter a valid email.",
      companyRequired: "Please enter your company name.",
      sizeRequired: "Please select a company size.",
    },
  },
  companyLanding: {
    nav: {
      intro: "Intro",
      howItWorks: "How it works",
      pricing: "Pricing",
      faq: "FAQ",
    },
    dropdown: {
      joinWaitlist: "Join Waitlist",
      forCompanies: "For companies",
      referral: "Referral",
    },
    startButton: "Get started",
    hero: {
      badge: "Hiring Intelligence",
      titleLine1: "Don't Buy",
      titleLine2Prefix: "Pay for",
      titleLine2Highlight: "Intelligence",
      subtitle: "Go beyond simple search and experience intelligence that understands talent.",
    },
    section1: {
      title: "Recruiting Agent, Harper",
      headlineLine1: "The best talent",
      headlineLine2: "is not on the open market.",
      bodyLine1:
        "Hiring is the most important decision that shapes a company's future.",
      bodyLine2: "Harper is a 24/7 AI recruiter that's 10x faster.",
    },
    why: {
      title: "Why Harper?",
      cards: [
        {
          title: "Beyond Keywords",
          desc:
            "Go beyond simple keyword search, <br />and experience intelligence that understands context and talent.",
        },
        {
          title: "Focus on Value",
          desc:
            "Let us filter the noise. <br />We show only the talent that truly matters.",
        },
        {
          title: "Intelligence on Top of Data",
          desc:
            "We unify scattered data, analyze it, and help you make better decisions.",
        },
      ],
    },
    feature: {
      title: "How it works.",
      rows: [
        {
          label: "People Search",
          title: "Explain it like a teammate.<br />Just speak naturally.",
          desc:
            "You don't need the exact job title.<br />Describe the talent you want and search freely.",
        },
        {
          label: "People Intelligence",
          title: "Discover the real story<br />behind the text.",
          desc:
            "We uncover interests, consistency, and passion... <br />Providing rich context that fills resume gaps. <br />Feel like you've already had a deep conversation before the interview.",
        },
        {
          label: "Harper Scout",
          title: "매일 후보자를 찾아<br />추천해드립니다.",
          desc:
            "원하는 인재상을 등록하면 매일 적절한 후보자를 추천해드립니다.<br />피드백을 바탕으로 추천결과가 점점 더 팀에 맞춰집니다.",
        }
      ],
    },
    testimonial: {
      body:
        "Harper is not just a search filter.<br />An AI agent synthesizes countless web sources,<br />reads context beyond resumes, reasons like a human,<br />and helps you directly discover the right talent.",
      name: "Chris & Daniel",
      role: "Co-founder",
    },
    faq: {
      title: "Questions & Answers",
      items: [
        {
          question:
            "Can I sign up and use it right now? (How do I get an invite code?)",
          answer:
            "Harper is currently running a private beta with a small set of tech companies to optimize data quality and AI resources. Our public launch is planned for Q2 this year. Join the waitlist and we'll send invite codes during onboarding.",
        },
        {
          question: "Can I trust AI-generated analysis?",
          answer:
            "Yes. Harper's AI doesn't guess; it verifies. We only analyze verifiable data from real web sources like LinkedIn, Google Scholar, GitHub, and blogs. Every insight includes source links so you can fact-check.",
        },
        {
          question:
            "What's the difference between 'keyword search' and Harper's 'semantic search'?",
          answer:
            "Searching for a 'Python developer' is different from finding a 'Python backend lead who has handled large-scale traffic.' Harper matches intent and context, not just keywords, to surface the best candidates for real-world challenges.",
        },
        {
          question: "What roles can Harper find?",
          answer:
            "Harper's AI engine is best optimized for high-skill tech talent like AI Researchers and ML Engineers. Beyond that, it already supports meaningful search and profiling for key tech roles such as Product Managers and Product Designers.",
        },
      ],
    },
    closing: {
      title: "Meet Harper.",
      headlineLine1: "Harper is your team's",
      headlineLine2: "dedicated AI recruiter.",
    },
    footer: {
      contact: "Contact Us",
    },
    pricing: {
      title: "A plan that scales with your team",
      subtitle: "All the features you need to grow your business.",
      contactLabel: "Contact us",
      billing: {
        monthly: "Monthly billing",
        yearly: "Yearly billing",
        discountLabel: "20% off",
      },
      plans: {
        pro: {
          name: "Pro",
          tagline: "Optimized for lean teams hiring 1–2 key people right now",
          priceUnit: "/ month",
          buttonLabel: "Contact us",
          features: [
            "150 credits / month<br />(1 credit per 10 candidates searched)",
            "Talent research & analysis<br />(deep research per candidate)",
            "AI smart search",
            "Unlimited chat",
          ],
        },
        max: {
          name: "Max",
          tagline: "For aggressive sourcing and fast team scaling",
          priceUnit: "/ month",
          buttonLabel: "Contact us",
          features: [
            "Includes all Pro features:",
            "350 credits / month",
            "Parallel search",
            "AI sourcing agent",
          ],
        },
        enterprise: {
          name: "Enterprise",
          tagline: "Dedicated plan with unlimited data access and custom integrations",
          priceUnit: "",
          buttonLabel: "Contact us",
          features: [
            "Includes all Max features:",
            "Unlimited credits",
            "Onboarding & training support",
            "Team collaboration & management sheets",
            "Dedicated customer support",
          ],
        },
      },
    },
  },
  help: {
    title: "Help",
    intro:
      "If you have any questions or need any help, please contact us at the email below.",
    emailCopied: "Email copied to clipboard",
    prompt:
      "Or do you have any suggestions for new talent pools or search results that don't match your expectations?",
    submit: "Submit",
    submitted: "Feedback submitted",
  },
  loading: {
    making_criteria: "Thinking how to get the best candidates",
    making_query: "Making SQL Query...",
    searching_candidates: "Searching Database...",
    searching_again: "An error occurred, searching again...",
    retrying_error: "Fixing SQL Query and issues...",
    summarizing: "Reading and analyzing candidates' information..",
    return: "Got Candidates. Now organizing results for return.",
    start: "",
    processing: "Processing...",
  },
  system: {
    history: "History",
    logout: "Logout",
    account: "Account",
    deleta: "Delete",
    activity: "Activity",
    requests: "Requests",
    connections: "Connections",
    loadmore: "Load More",
    message: "Message",
    close: "close",
    hello: "Hello",
    intro: "Who are you looking for?",
    credits: "Credits",
    credit_history: "Credits Request history",
    no_credit_request: "No credit request history.",
    processing: "Processing...",
    done: "Done",
    pending: "Pending",
    credit_request: "Request More Credits",
    close_sidebar: "close sidebar",
    open_sidebar: "open sidebar",
    search: "Search",
    submit_request: "Submit Request",
    credit_request_submitted: "Your request has been submitted.",
    credit_request_submitted_description:
      "Thank you for requesting! Your credit increase is being reviewed, and a decision will be made soon. If opted in, you’ll receive updates on the status via email.",
  },
  company: {
    information: "Company Information",
    description: "Company Description",
    news: "Important News",
    investors: "Investors",
    established: "Established",
    hq: "HQ",
  },
  search: {
    resultHeader: {
      by: "By",
      readingCandidates: "Reading candidate info and checking fit...",
      finished: "Search complete",
    },
    resultBody: {
      emptyPrompt:
        "After finishing the conversation, click “Search” and results will appear here.",
      page: "Page {page}",
      loadingSuffix: " (loading...)",
      capped: "(capped to {cap})",
      previous: "Previous",
      next: "Search next 10 more",
      credit: {
        withCredit: " (1 credit)",
        noCredit: " (no credit)",
      },
    },
    timeline: {
      headerTitle: "Harper is finding candidates",
      stopped: "Search stopped",
      stop: "Stop",
      note: "* Max plan users can run multiple searches in parallel.",
      steps: {
        parseTitle: "Understand the request",
        parseDesc: "Interpreting criteria and building a search strategy.",
        planTitle: "Plan the search strategy",
        planDesc: "Clarifying criteria and setting the search scope.",
        refineTitle: "Optimize search method",
        refineDesc: "Refining queries/filters for performance and accuracy.",
        runningTitle: "Find candidates broadly",
        runningDesc: "Searching across experience/company/keywords.",
        rankingTitle: "Ranking & scoring",
        rankingDesc: "Calculating priority based on your criteria.",
        recoveryTitle: "Add recovery conditions",
        recoveryDesc: "Analyzing issues and proceeding safely.",
        recoveryRetryTitle: "Run recovery & retry path",
        recoveryRetryDesc: "Relaxing constraints or retrying with another strategy.",
        retryTitle: "Retry with alternative strategy",
        retryDesc: "Relaxing constraints and searching again.",
      },
    },
    status: {
      parsing: "parsing: Designing how to find matching candidates...",
      refine: "refine: Optimizing the search method.",
      running: "running: Searching across the candidate pool...",
      errorHandling:
        "error_handling: An issue occurred during search. Resolving it now...",
      errorHandlingWithCount:
        "error_handling: Found {count} candidates. Broadening search to find more...",
      expanding:
        "expanding: Broadening the search to find more candidates...",
      expandingWithCount:
        "expanding: Found {count} candidates. Broadening search to find more...",
      ranking: "ranking: Reviewing candidates and scoring fit...",
    },
    defaultMessage: {
      intro:
        "We selected {total} candidates from the full pool and checked them against your criteria.",
      full: "{full} fully met all criteria.",
      partial: "{partial} met some criteria.",
    },
    ui: {
      searchResult: "Search results {full}/{total}",
    },
    completionPrompt: {
      outputLanguage: "English",
    },
  },
  data: {
    currentExperience: "Current Experience",
    experience: "Experiences",
    education: "Educations",
    present: "Present",
    save: "Save",
    saved: "Saved",
    totalexp: "Total Experience",
    publications: "Publications",
    summary: "Summary",
    request: "Request Connection",
    request_cancel: "Cancel Connection",
    generating: "Generating summary...",
  },
} as const;
