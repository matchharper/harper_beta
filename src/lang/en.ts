export const en = {
  auth: {
    login: "Log in",
    signup: "Sign up",
    continueWithGoogle: "Continue with Google",
    confirmPassword: "Confirm password",
    emailConfirmationSent:
      "We've sent a confirmation email. Please check your inbox.",
    invalidAccount: "Account not found.",
  },
  invitation: {
    title: "Request access",
    description: "We will email you an access link as soon as possible.",
    nameTitle: "Tell us your name.",
    nameDescription:
      "Your invite code has been verified. Please enter the name you'd like to use.",
    namePlaceholder: "Name",
    placeholder: "Invite code",
    nameSubmit: "Save",
    submit: "Continue",
    divider: "or",
    waitlist: "Request access",
    contact: "Contact us",
    requestAccess: {
      title: "Request access",
      description:
        "Tell us a bit about your team and hiring needs. If approved, we'll email the access link to your signed-in address.",
      submit: "Send request",
      submitted:
        "Your request has been submitted. We'll email you a link once access is approved.",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      companyLabel: "Company",
      companyPlaceholder: "Company name",
      roleLabel: "Role",
      rolePlaceholder: "For example: Founder, Hiring Manager",
      hiringNeedLabel:
        "Most important role(s) you need to hire for and rough headcount",
      hiringNeedPlaceholder:
        "For example: Backend Engineer x2, Founding Recruiter x1",
      errors: {
        missingSession:
          "We couldn't verify your session. Please sign in again.",
        invalidForm: "Please fill in your name and company.",
        submitFailed: "Failed to submit your request. Please try again.",
      },
    },
    errors: {
      emptyCode: "Please enter the invite code.",
      invalidCode: "The invite code is invalid.",
      domainMismatch:
        "The domain of your signup email must match the company domain assigned to this invite code.",
      emptyName: "Please enter your name.",
      saveNameFailed: "Failed to save your name. Please try again.",
    },
  },
  join: {
    roles: {
      recruiter: "Professional Recruiter",
      other: "Other",
      options: [
        "Professional Recruiter",
        "CEO / Founder",
        "Co-Founder",
        "Hiring Manager",
        "Team Lead",
        "Engineer",
        "VC",
        "Other",
      ],
    },
    sizes: ["1-10", "11-50", "51-100", "101-200", "201-500", "501+"],
    steps: {
      contact: {
        title:
          "Please share your name and the email address where we can reach you.",
        description: "This takes less than a minute.",
      },
      role: {
        title: "What is your role at the company?",
        description: "",
      },
      company: {
        title: "Tell us your company name and website.",
        description: "(Website is optional.)",
      },
      companyRecruiter: {
        title: "Tell us your firm or agency name and website.",
        description: "(Website is optional.)",
      },
      size: {
        title: "How large is your company (total headcount)?",
        description: "",
      },
      needs: {
        title:
          "Tell us which role(s) you need to hire for most urgently and roughly how many people you need.",
        description: "Optional",
      },
      additional: {
        title:
          "If there's anything else you'd like Harper to know, or any hiring challenge you're dealing with, feel free to share it.",
        description: "Optional",
      },
      additionalRecruiter: {
        title:
          "If there's anything else you'd like Harper to know, or a key need you'd like solved, feel free to share it.",
        description: "Optional",
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
      roleOtherPlaceholder: "Please type your role",
      needsPlaceholder:
        "e.g. 2 Machine Learning Engineers, 1 Deep Learning Researcher",
      additionalPlaceholder:
        "e.g. Hiring is urgent, and we're unsure what criteria we should use to evaluate candidates.",
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
      title: "Your request has been submitted.",
      description:
        "Harper is building a better way for startups to find exceptional talent.\nWe'll be in touch soon.",
      backToCompanies: "Back to home",
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
      blog: "Blog",
    },
    dropdown: {
      intro: "Intro",
      howItWorks: "How it works",
      pricing: "Pricing",
      faq: "FAQ",
      blog: "Blog",
    },
    startButton: "Get started",
    hero: {
      badge: "Hiring Intelligence",
      titleLine1: "Don't Buy",
      titleLine2Prefix: "Pay for",
      titleLine2Highlight: "Intelligence",
      subtitle:
        "No matter your criteria,<br />our AI search engine instantly finds the right profiles for you.",
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
      sub: "",
      cards: [
        {
          title: "Beyond Keywords",
          desc: "Go beyond simple keyword search, <br />and experience intelligence that understands context and talent.",
        },
        {
          title: "Focus on Value",
          desc: "Let us filter the noise. <br />We show only the talent that truly matters.",
        },
        {
          title: "Intelligence on Top of Data",
          desc: "We unify scattered data, analyze it, and help you make better decisions.",
        },
      ],
    },
    feature: {
      title: "How it works.",
      rows: [
        {
          label: "People Search",
          title: "Explain it like a teammate.<br />Just speak naturally.",
          desc: "You don't need the exact job title.<br />Describe the talent you want and search freely.",
        },
        {
          label: "People Intelligence",
          title: "Discover the real story<br />behind the text.",
          desc: "We uncover interests, consistency, and passion... <br />Providing rich context that fills resume gaps. <br />Feel like you've already had a deep conversation before the interview.",
        },
      ],
    },
    testimonial: {
      body: "Harper is not just a search filter.<br />An AI agent synthesizes countless web sources,<br />reads context beyond resumes, reasons like a human,<br />and helps you directly discover the right talent.",
      name: "Chris & Daniel",
      role: "Co-founder",
    },
    faq: {
      title: "Questions & Answers",
      items: [
        {
          question: "Can I sign up and use it right away?",
          answer:
            "Harper is currently operating as an approval-based beta. After you sign in and submit a request access form, we review requests and grant access on a rolling basis.",
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
      subtitle: "First, start for free and decide later.",
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
          priceUnit2: "/ month",
          buttonLabel: "Contact us",
          features: [
            "50 profile reveals / month",
            "AI analysis of paper + code quality",
          ],
        },
        max: {
          name: "Max",
          tagline: "For aggressive sourcing and fast team scaling",
          priceUnit: "/ month",
          priceUnit2: "/ month",
          buttonLabel: "Contact us",
          features: [
            "Includes all Pro features:",
            "120 profile reveals / month",
            "Up to 3 concurrent searches",
            "AI sourcing agent",
          ],
        },
        enterprise: {
          name: "Enterprise",
          tagline:
            "Dedicated plan with unlimited data access and custom integrations",
          priceUnit: "",
          priceUnit2: "",
          buttonLabel: "Contact us",
          features: [
            "Includes all Max features:",
            "Custom reveal credit volume",
            "Onboarding & training support",
            "Team collaboration & management sheets",
            "Dedicated customer support",
          ],
        },
      },
    },
    pricingFaq: {
      title: "Billing & Usage FAQ",
      items: [
        {
          question: "How are reveal credits counted?",
          answer:
            "Searches and pagination are free. Credits are only spent when you reveal a candidate profile. Free includes 10 monthly reveal credits, Pro includes 50, and Max includes 120.",
        },
        {
          question: "How is the monthly reveal credit calculated?",
          answer:
            "It is calculated in one-month periods from the payment date, which is also the new plan start date. Monthly plans refresh reveal credits on each billing date, and annual plans refresh monthly reveal credits on the same day each month based on the subscription start date.",
        },
        {
          question: "Can I change my plan or request more reveal credits?",
          answer:
            "Yes. You can request a different plan anytime, and we will guide you to the best option for your hiring volume.",
        },
        {
          question: "Do you provide receipts or invoice support?",
          answer:
            "Yes. A receipt is issued after successful payment. If you need additional accounting documents, please contact us.",
        },
      ],
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
    credits: "Usage",
    processing: "Processing...",
    done: "Done",
    pending: "Pending",
    close_sidebar: "close sidebar",
    open_sidebar: "open sidebar",
    search: "Search",
    submit_request: "Submit Request",
  },
  home: {
    queryPlaceholder:
      "Graduated from a domestic university and has AI/ML experience at a US M7 company",
    queryPlaceholders: [
      "Graduated from a domestic university and has AI/ML experience at a US M7 company",
      "Product Manager with experience at Naver/Kakao/Line/Coupang/Baemin + strong development skills",
      "AI researcher with CVPR/NeurIPS publications in vision or multimodal models",
      "Backend engineer who led a 0-to-1 product launch in a Series A-C startup",
      "B2B sales professional with strong English communication and global onboarding experience",
    ],
    examples: [
      {
        label: "Engineer",
        query:
          "Graduated from a Korean science high school, studied at Seoul National University / KAIST, and has up to 2 years of AI/Machine Learning experience at a US M7 company",
      },
      {
        label: "Product Manager",
        query:
          "Product Manager with experience at Naver/Kakao/Line/Coupang/Baemin + strong development skills",
      },
      {
        label: "Researcher",
        query:
          "AI researcher (Master's or above, excluding professors) with CVPR/NeurIPS publications and strong Vision Embedding or multimodal (VLM) research experience",
      },
    ],
  },
  chat: {
    composerPlaceholder:
      "Ask anything (Enter to send / Shift+Enter for newline)",
    attachFile: "Attach file",
    attachLink: "Add link",
    addLink: "Add link",
    linkPlaceholder: "https://example.com",
    invalidLink: "Please enter a valid link.",
    attachedFileLabel: "Attached file",
    attachedLinkLabel: "Attached link",
    fileReading: "Reading file...",
    fileReadFail: "Could not read the file. Please try again.",
    candidSuggestions: [
      "Is this person open to a job change?",
      "Evaluate whether this person is a good fit for our team, with reasons.",
      "What’s a good topic to start the first conversation with?",
    ],
    unlockProfileCta: "Start the conversation",
    loadingHistory: "Loading conversation history...",
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
        withCredit: "",
        noCredit: "",
      },
    },
    timeline: {
      headerTitle: "Harper is finding candidates",
      stopped: "Search stopped",
      stop: "Stop",
      note: "* Max plan users can run multiple searches in parallel.",
      note2:
        "* Due to the characteristics of LLMs, the search results may vary depending on the criteria.",
      note3:
        "* Even if you close the site or switch to another screen, the search will continue.",
      found: "Found 10 candidates matching all criteria.",
      steps: {
        parseTitle: "Understand the request",
        parseDesc: "Interpreting criteria and building a search strategy.",
        planTitle: "Plan the search strategy",
        planDesc: "Clarifying criteria and setting the search scope.",
        refineTitle: "Optimize search method",
        refineDesc: "Refining queries/filters for performance and accuracy.",
        runningTitle: "Find candidates broadly",
        runningDesc: "Searching across experience/company/keywords.",
        partialTitle: "Collect candidates",
        partialDesc: "Merging and organizing results across variants.",
        rankingTitle: "Ranking & scoring",
        rankingDesc: "Calculating priority based on your criteria.",
        recoveryTitle: "Add recovery conditions",
        recoveryDesc: "Analyzing issues and proceeding safely.",
        recoveryRetryTitle: "Run recovery & retry path",
        recoveryRetryDesc:
          "Relaxing constraints or retrying with another strategy.",
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
      expanding: "expanding: Broadening the search to find more candidates...",
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
  career: {
    "career.api.auth.email_onboarding_email_mismatch":
      "The email in the onboarding link doesn't match your login account.",
    "career.api.auth.email_onboarding_link_invalid":
      "The email onboarding link has expired or is invalid. Please provide your email again on the landing page.",
    "career.api.auth.network_invite_email_mismatch":
      "Please sign in with the same Google account that received the invitation email.",
    "career.api.auth.network_invite_not_found":
      "We couldn't find the invitation details.",
    "career.api.basic_info.email_invalid":
      "Please enter a valid email address.",
    "career.api.basic_info.name_required": "Please enter your name.",
    "career.api.chat.active_opportunity_search":
      "Harper is finding opportunities right now. Once the search finishes, you can continue the conversation here.",
    "career.api.profile.sources_missing_refresh":
      "There's no LinkedIn link or resume text to refresh.",
    "career.call.career_call_card.0ocs6vv": "Start Call",
    "career.call.career_call_card.1vn8y3k": "Connecting...",
    "career.call.duration": "{m}m {s}s",
    "career.call.environment_notice.collapse": "Collapse",
    "career.call.environment_notice.description":
      "If there's a lot of background noise, Harper may not hear you clearly, which can lead to a less smooth call. Please try to be in a quiet place.",
    "career.call.environment_notice.heading":
      "Calls may not be accurate in noisy environments.",
    "career.call.environment_notice.title": "Call Environment Notice",
    "career.call.internal_brief_followup":
      "It seems the call about the {companyName} {roleTitle} ended a bit short. The connection is still active, and if you'd like to discuss further, please continue from the call card on your Home screen.",
    "career.call.internal_completed_followup":
      "I'll make sure to reflect what you shared about the {companyName} {roleTitle} when I pass it along to the company. The connection is still active.",
    "career.call.internal_interrupted_followup":
      "It looks like the call regarding the {companyName} {roleTitle} was interrupted. The connection is still active, and if you'd like to continue, please resume from the call card on your Home screen, not in chat.",
    "career.call.internal_opportunity_call_actions.0fpx491": "Company",
    "career.call.internal_opportunity_call_actions.pending_call_label":
      "{companyName} - {roleTitle} call pending",
    "career.call.opening.default_text":
      "Let's talk it through on a call. We can start with any recent shifts in your priorities, or feel free to share what you think companies should know about your roles and experience so far. The more information you share, the better I can tailor connection requests and opportunities for you.",
    "career.call.opening.instruction.conversation_starter":
      "\n## Conversation starter opening\nThis call was initiated by the user clicking a specific conversation starter button.\nPrioritize the purpose and question direction of the starter content below above all else.\nDo not arbitrarily choose questions about recent priorities, preferred conditions, or general opportunity exploration.",
    "career.call.opening.instruction.default":
      "The call has just started. Harper should initiate the conversation so the user doesn't have to search for something to say first.\nDo not use tools. For now, just make the opening remarks and the first question.\nSpeak in natural, warm, professional English, like the first moment of a real phone call.\nKeep it brief, 2-4 sentences, and end with a question the user can answer directly.\nThere are two main ways to start the call: 1) continuing a conversation that was previously happening via chat, or 2) starting a new conversation by call.\nIf recent chat context is provided, review it first to determine whether this should continue the previous chat conversation over the call.\nIf it's natural to continue from the previous context, pick up directly from the last question or confirmation exchanged, without introducing a new topic. If a brief greeting feels natural, greet first.\nIf needed, briefly restate the last question or confirmation point to continue smoothly.\nIf it's natural to start a new conversation, begin like a friendly career agent opening a coffee chat.\nIf you see context from recent conversations or activities, connect to it specifically. For example, if the user recently declined a connection offer or provided feedback on a recommendation, ask if anything has changed since then.\nIf the specific context is weak, ask about recent changes in priorities, aspects of their current role or experience they'd like to share more about, or one personal preference or constraint.\nBriefly mention once that more context helps Harper make better company connection requests and tailored opportunity recommendations, then ask a question a career agent would naturally ask.",
    "career.call.opening.instruction.near_finish":
      "\n## Incomplete onboarding near-finish opening\nThe current career interview is almost complete, though not yet finished.\n- filledInsights: {filledCount}/{totalCount}\n- remainingInsights: {remainingCount}\n- Do not start with general new call greetings or broad questions like 'How are you today?' or 'Have your recent priorities changed?'\n- The first sentence should naturally convey the intention that the conversation is almost over, and you'll just do a quick final confirmation for more accurate recommendations/connections.\n- Use the recent chat context only as background; proceed directly to the last remaining missing checklist question hint or final priority confirmation.\n- If the user has already provided context for the final priority confirmation, do not repeat the same confirmation question; move directly to a brief closing.",
    "career.call.opening.instruction.onboarding":
      "The call has just started. This call is for the 5-minute career interview.\nDo not use tools. For now, just make the opening remarks and the first question.\nSpeak in natural, warm, professional English, like the first moment of a real phone call.\nIn the first sentence, briefly explain why this conversation is useful: Harper is checking the user's current situation and preferences to recommend better opportunities and help with company connections.\nImmediately after the explanation, ask one question.\nChoose a high-priority item whose `current_status` is missing in the session instructions' Onboarding Question Checklist, and base the question on that item's question hint.\nDo not ask about items that are already `covered` or topics already answered in recent conversation.\nUse recent conversation only as background; do not let it replace the missing checklist item and question hint.\nKeep the full opening to 3-4 sentences, and make the final sentence a question the user can answer right away.\nExample: \"Hi. This 5-minute career interview helps Harper recommend stronger opportunities and share your context clearly when there may be a company connection. You can answer casually. To start, I'd like to understand your current search temperature. Are you actively looking for your next role, or more open to hearing about great opportunities if they come up?\"",
    "career.call.opening.instruction.reference_opening":
      "## Reference opening remarks\nNaturally incorporate the intent of the phrases or questions below into the call's opening remarks. Speak in a way that aligns with the instructions above and the recent conversation context, rather than reading them verbatim.",
    "career.call.opening.instruction.use_recent_context":
      "Refer to the recent chat context above first when determining the opening remarks for the call. If the last conversation is still ongoing, do not start with general new greetings or new questions.",
    "career.call.opening.recent_context.header": "## Recent chat context\n",
    "career.call.opening.recent_context.user": "User",
    "career.call.opening.relative.day_many": "{count} days ago",
    "career.call.opening.relative.day_one": "{count} day ago",
    "career.call.opening.relative.hour_many": "{count} hours ago",
    "career.call.opening.relative.hour_one": "{count} hour ago",
    "career.call.opening.relative.just_now": "Just now",
    "career.call.opening.relative.minute_many": "{count} minutes ago",
    "career.call.opening.relative.minute_one": "{count} minute ago",
    "career.call.opening.relative.month_many": "{count} months ago",
    "career.call.opening.relative.month_one": "{count} month ago",
    "career.call.wrapup_fallback.brief":
      "We only talked briefly today. When you have a little more time, share a bit more and I'll use that context to help you better.",
    "career.call.wrapup_fallback.completed":
      "Thanks for sharing all of that. I'll use what you told me to bring back opportunities that should be a stronger fit.",
    "career.call.wrapup_fallback.onboarding_remaining":
      "There's still a little onboarding left. If we continue in this chat from where the call dropped, I can use that context to find stronger opportunities for you.",
    "career.chat.career_call_screen.082qr7j": "Completion Rate",
    "career.chat.career_call_screen.0a6n15y": "Toggle Captions",
    "career.chat.career_call_screen.0n1pl8k":
      "You can end the career interview anytime. You're almost done - just answer 2-3 more questions and it will end automatically!",
    "career.chat.career_call_screen.0u4w1k5":
      "Your conversation will appear here once it starts.",
    "career.chat.career_call_screen.0yqbta2": "Indefinite Pause",
    "career.chat.career_call_screen.15tfl05": "Unmute",
    "career.chat.career_call_screen.16d2ux9": "End Call",
    "career.chat.career_call_screen.1914g7j": "Mute",
    "career.chat.career_call_screen.1lwovam": "Career Interview Progress",
    "career.chat.career_call_screen.force_complete_label": "Finish Now",
    "career.chat.career_composer_section.017fk2m":
      "Feel free to tell me your desired role or conditions.",
    "career.chat.career_composer_section.02tj0kp": "About 5 minutes",
    "career.chat.career_composer_section.041n9nc":
      "Analyzing your resume and links.",
    "career.chat.career_composer_section.0bxwclq": "Summarizing the call.",
    "career.chat.career_composer_section.0e686ow": "Ask anything",
    "career.chat.career_composer_section.19raxy2":
      "The conversation will start after you submit basic info.",
    "career.chat.career_composer_section.1g4p5ul":
      "You can start a conversation after logging in.",
    "career.chat.career_composer_section.1i8zl29":
      "Please start the conversation using the start button below.",
    "career.chat.career_composer_section.1rqak4s":
      "Keep the conversation going by typing here.",
    "career.chat.career_composer_section.1sjkx1r": "Send Message",
    "career.chat.career_composer_section.1vn1k94": "Call Mode",
    "career.chat.career_composer_section.resume_interview_cta":
      "Continue the 5-minute career interview",
    "career.chat.career_message_bubble.0jnmgxp":
      "Great. Feel free to start by telling me about your recent updates or what you've been enjoying working on lately.",
    "career.chat.career_message_bubble.0o5swvp": "Call",
    "career.chat.career_message_bubble.0ovvmd7": "Phone Call",
    "career.chat.career_message_bubble.0whsa78": "Call",
    "career.chat.career_message_bubble.1tqt1ip": "Enhance Resume",
    "career.chat.career_message_bubble.1xpjlib":
      "You can also type your reply.",
    "career.chat.career_message_bubble.optional_call_notice":
      "This isn't required; it's just a call to ask a few questions that may help with the connection. Even if you don't join, I'll keep handling the connection with {companyName}.",
    "career.chat.career_timeline_section.00l29f9":
      "Global SaaS team ML Engineer (visa sponsorship available)",
    "career.chat.career_timeline_section.06wb0ci": "Sign up",
    "career.chat.career_timeline_section.074rfeb": "Log in",
    "career.chat.career_timeline_section.079zqvv": "Continue conversation",
    "career.chat.career_timeline_section.09zvq4w": "First time here?",
    "career.chat.career_timeline_section.0ai2d9e": "Start Call",
    "career.chat.career_timeline_section.0akm24y":
      "I started your Career Workspace with the info you previously submitted.",
    "career.chat.career_timeline_section.0arsq09":
      "Hi. Please log in to your account first to save your information.",
    "career.chat.career_timeline_section.0bh3gyc": "Loading...",
    "career.chat.career_timeline_section.0cx2fkc": "No file selected",
    "career.chat.career_timeline_section.0dm46ie":
      "Multiple selections allowed",
    "career.chat.career_timeline_section.0ebbrm3":
      "You can upload PDF, DOCX, TXT, and MD files.",
    "career.chat.career_timeline_section.0g10mif":
      "I'll quickly check your desired role and any conditions you'd like to avoid.",
    "career.chat.career_timeline_section.0hahmkh": "Upload Resume",
    "career.chat.career_timeline_section.0hfdmut": "Submit",
    "career.chat.career_timeline_section.0hm90b7":
      "I'm preparing the next message based on your feedback.",
    "career.chat.career_timeline_section.0hzihgh": "Preparing analysis...",
    "career.chat.career_timeline_section.0ijd99q":
      "To connect you with great companies, roles, and opportunities, I'd like to ask a few more questions in a 5-minute career interview.",
    "career.chat.career_timeline_section.0jstyw1": "Already have an account?",
    "career.chat.career_timeline_section.0l0nx9g": "Preparing...",
    "career.chat.career_timeline_section.0m1h5tz":
      "Analyzing your resume and link information...",
    "career.chat.career_timeline_section.0n6afuz":
      "You can start with just a resume or a single link. You can update your info anytime.",
    "career.chat.career_timeline_section.0ong27a": "Additional Links",
    "career.chat.career_timeline_section.0or3a9m":
      "Senior Software Engineer, US AI Product Team",
    "career.chat.career_timeline_section.0qzkj18":
      "I'm checking the next steps.",
    "career.chat.career_timeline_section.0t1ynxd":
      "See More Previous Conversations",
    "career.chat.career_timeline_section.0twh3v7": "Organizing...",
    "career.chat.career_timeline_section.0v3ly8r":
      "I'll end this for now and continue later.",
    "career.chat.career_timeline_section.13lt218":
      "Domestic Deep Tech Startup Applied AI Engineer",
    "career.chat.career_timeline_section.171qysx":
      "Your 5-minute career interview isn't finished yet.",
    "career.chat.career_timeline_section.17u6jy7": "Conversation date",
    "career.chat.career_timeline_section.1ct6hfb":
      "I'm organizing the next recommendation direction based on the feedback you just gave.",
    "career.chat.career_timeline_section.1gfaiqo": "Select file",
    "career.chat.career_timeline_section.1go05rp":
      "Keep answering to start exploring personalized opportunities.",
    "career.chat.career_timeline_section.1gvzqes": "Add Link",
    "career.chat.career_timeline_section.1ovt2je": "Key Links",
    "career.chat.career_timeline_section.1qh8yei": "Harper is joining...",
    "career.chat.career_timeline_section.1r3zjih": "Save Selection",
    "career.chat.career_timeline_section.1sop3l6": "Sign in with Google",
    "career.chat.career_timeline_section.1sv2rkn": "ID (Email)",
    "career.chat.career_timeline_section.1xcwt3x": "Start chat",
    "career.chat.career_timeline_section.1xwvmgk": "Processing...",
    "career.chat.career_welcome_screen.023rop8": "Profile verified",
    "career.chat.career_welcome_screen.0ce6b4x": "You",
    "career.chat.career_welcome_screen.0g4sq42":
      "Preparing our conversation...",
    "career.chat.career_welcome_screen.169zgsw":
      "Once we confirm your desired role, work style, and exclusions, we'll move on to exploring real positions.",
    "career.chat.career_welcome_screen.1gexpus":
      "I'll briefly summarize the criteria for your first recommendations.",
    "career.chat.career_welcome_screen.criteria_with_name":
      "I'll spend about 5 minutes aligning on opportunities that fit {displayName}.",
    "career.chat.career_welcome_screen.greeting_with_name":
      "Hi {displayName}, nice to meet you. I'm Harper.",
    "career.chat.opportunity_preview_cards.open_posting_label":
      "Open {companyName} {title} posting",
    "career.chat.tool.open_url.start": "Checking the shared link.",
    "career.chat.tool.request_internal_role_priority_review.start":
      "Saving your request for priority review of the internal role.",
    "career.chat.tool.research_company.start":
      "Looking up company information.",
    "career.chat.tool.update_setting.start":
      "Updating your recommendation settings.",
    "career.chat.tool.update_talent_profile.start":
      "Updating your profile information.",
    "career.common.cancel": "Cancel",
    "career.common.career.028kv4g": "View Details",
    "career.common.career.030f28a": "Search failed",
    "career.common.career.047a363": "Failed to load your company watchlist.",
    "career.common.career.051p9x0":
      "I find and recommend hidden startup opportunities first,",
    "career.common.career.055fv5b": "Hybrid",
    "career.common.career.07r9xc5": "Download",
    "career.common.career.07vhdpu": "Save resume/link and update info",
    "career.common.career.083cky2": "No company description yet.",
    "career.common.career.09c4j2c": "Open Link",
    "career.common.career.0beg208": "{count} recommendations",
    "career.common.career.0cp7wph": "Could not load company watchlist count.",
    "career.common.career.0dtwsdj": "Reviewed {count} postings",
    "career.common.career.0f24yir": "Role Description",
    "career.common.career.0h5494n": "Following",
    "career.common.career.0j3w14l": "Update Resume",
    "career.common.career.0jt5nqc": "No saved resumes.",
    "career.common.career.0ketgfl": "In-person",
    "career.common.career.0kn6r0x":
      "- I'll find and notify you of meaningful changes like funding, hiring, team shifts, and business results.",
    "career.common.career.0madjab": "Previous Opportunity",
    "career.common.career.0ol21b2": "Company Info",
    "career.common.career.0rd0cjd": "Notice",
    "career.common.career.0tmpcjv": "Updating profile",
    "career.common.career.0vbpl1c": "This search couldn't be completed.",
    "career.common.career.0vrhfby":
      "The info I learn about you from your resume greatly affects connections and recommendations with companies.",
    "career.common.career.0w4x7qh": "No filename info",
    "career.common.career.0wohsg4": "View job description (JD)",
    "career.common.career.0xq40c2": "Next Job Posting",
    "career.common.career.0y3ajvx": "Searching...",
    "career.common.career.0y7cerf": "Saved Resumes",
    "career.common.career.0z5xpdx": "Considerations",
    "career.common.career.11hatjy": "Career Settings",
    "career.common.career.11j6jdx": "Summarizing our conversation.",
    "career.common.career.1338q8i": "Settings",
    "career.common.career.14ybad0": "Update Notes",
    "career.common.career.152e0fk": "Job posting review complete",
    "career.common.career.16x7oad": "Close Settings",
    "career.common.career.16yncp4":
      "Finding the best opportunities based on your profile and recent conversations.",
    "career.common.career.18neuzv": "Next opportunity",
    "career.common.career.19aqpg8": "Quickly review roles and conditions",
    "career.common.career.1bbxwls":
      "Set the matching level at which companies can view your profile.",
    "career.common.career.1ceyibb":
      "I'm a Career Manager who helps candidates with career opportunities and negotiating terms from their perspective.",
    "career.common.career.1clmbsb": "Stopped the requested search.",
    "career.common.career.1d6xtz2": "Search Complete",
    "career.common.career.1kdjvb7":
      "Getting ready to pick up our conversation after a while.",
    "career.common.career.1lzad2w": "Chat Summary",
    "career.common.career.1nldebx": "Review",
    "career.common.career.1nwpekv": "Stop Searching",
    "career.common.career.1ominm4": "My Links",
    "career.common.career.1r843ma": "Remote",
    "career.common.career.1ugn5p7":
      "Detailed role description isn't summarized yet.",
    "career.common.career.1v4kit0":
      "Your profile will be hidden from these companies, and you will not receive matches from them.",
    "career.common.career.1xci024":
      "I'm summarizing the call and preparing the next message.",
    "career.common.career.1xe09ft": "Harper's Summary",
    "career.common.career.1xo6n8a": "Previous Posting",
    "career.common.career.recommendation_search_stopped_title":
      "Position search stopped",
    "career.common.career_chat_panel.1q1egw3": "Connecting call...",
    "career.common.career_flow_provider.06f4hcx":
      "Ended before the 12-hour HR stream was completed.",
    "career.common.career_flow_provider.0750gye":
      "Failed to generate 12-hour HR.",
    "career.common.career_flow_provider.0cjev5a":
      "Based on your saved profile, preferences, and recent feedback, recommend public job openings to review now. Don't save new long-term preferences; just search once using current data.",
    "career.common.career_flow_provider.16uupip":
      "An error occurred while ending the career interview.",
    "career.common.career_flow_provider.19x0zaz":
      "Could not update company follow status.",
    "career.common.career_flow_provider.1tnnmyb":
      "Failed to end career interview.",
    "career.common.career_flow_provider.1z048f4":
      "Failed to create a company follow-up message.",
    "career.common.career_flow_provider.request_more_open_positions":
      "Recommend more open positions",
    "career.common.career_flow_provider.resume_interview_error":
      "Could not continue the career interview.",
    "career.common.career_history_panel.00rerkr":
      "Looking for a great opportunity.",
    "career.common.career_history_panel.01m9cc2": "More items to load.",
    "career.common.career_history_panel.02i826z": "New",
    "career.common.career_history_panel.02jvl2x":
      "Reviewing the first recommended candidates.",
    "career.common.career_history_panel.0496lr7": "Desired role",
    "career.common.career_history_panel.05lg6gq":
      "Review saved experience and preferences together.",
    "career.common.career_history_panel.06l333i": "Explore positions",
    "career.common.career_history_panel.06mgpci": "Saved",
    "career.common.career_history_panel.06sq5fd": "On-site",
    "career.common.career_history_panel.090irfh": "Part-time",
    "career.common.career_history_panel.0boi6up": "Candidate summary",
    "career.common.career_history_panel.0cxzeie": "Signal cleanup",
    "career.common.career_history_panel.0eamanf":
      "Roles that don't match your criteria will be excluded from recommendations.",
    "career.common.career_history_panel.0fhjm3n": "Under Review",
    "career.common.career_history_panel.0fw7sr6":
      "Comparing your network and public positions using the same criteria.",
    "career.common.career_history_panel.0gesjui": "Remote",
    "career.common.career_history_panel.0gfcdit":
      "Please tell me what kinds of opportunities you're open to.",
    "career.common.career_history_panel.0iymhpv": "Review Documents",
    "career.common.career_history_panel.0jj9mjx":
      "Confirm the role and level you want next.",
    "career.common.career_history_panel.0kl8zzx":
      "Tell me your desired role, work style, and any exclusions, and I'll start your first recommendations.",
    "career.common.career_history_panel.0mo6t6e":
      "Preparing your first recommendation",
    "career.common.career_history_panel.0okcy6f":
      "No opportunities match this tab yet.",
    "career.common.career_history_panel.0p8wa8t":
      "Your first recommendation will show in New Positions when ready.",
    "career.common.career_history_panel.0paqqgp": "Archived",
    "career.common.career_history_panel.0pes81b":
      "Once we confirm your criteria through chat, we'll start exploring your first position.",
    "career.common.career_history_panel.0qv04k8":
      "Set your location, work style, and compensation preferences.",
    "career.common.career_history_panel.0rwgnws":
      "I summarize strong career signals from your profile and conversations.",
    "career.common.career_history_panel.0s3czqf":
      "Loading saved information...",
    "career.common.career_history_panel.0s6myeq": "Exploring",
    "career.common.career_history_panel.0sbhtqh": "Intern",
    "career.common.career_history_panel.0shxyyt":
      "Exclude industries, company types, and roles you're not interested in.",
    "career.common.career_history_panel.0taw0z7": "On-site + Remote",
    "career.common.career_history_panel.0wrwhc3": "Exclusion Criteria",
    "career.common.career_history_panel.0xu63p6": "Sort by Fit",
    "career.common.career_history_panel.0y27adb": "In progress",
    "career.common.career_history_panel.11est1e": "Summarize Results",
    "career.common.career_history_panel.11oeye3": "Chat with Harper",
    "career.common.career_history_panel.12v6hq4":
      "Only positions matching your criteria will remain in the new list.",
    "career.common.career_history_panel.13mr3sj": "Working Conditions",
    "career.common.career_history_panel.17505te":
      "I'm filtering roles to keep only those worth applying for based on our conversations.",
    "career.common.career_history_panel.1aylp85": "Archived",
    "career.common.career_history_panel.1ge5j94":
      "Once your first recommendations are ready, you can review them right away in the New Positions tab.",
    "career.common.career_history_panel.1h65j93":
      "You've reviewed all newly received opportunities.",
    "career.common.career_history_panel.1hsndwk": "Ended",
    "career.common.career_history_panel.1ijllph":
      "I'm keeping only positions that match your criteria. They'll show up when new ones are ready.",
    "career.common.career_history_panel.1knq1rh":
      "I've reviewed your experience and resume.",
    "career.common.career_history_panel.1n5k969": "List View",
    "career.common.career_history_panel.1p6gpzi":
      "Reviewed positions show up right away in the New Positions tab.",
    "career.common.career_history_panel.1q435d3":
      "There are no opportunities in this status yet.",
    "career.common.career_history_panel.1rvnrzl": "Contract",
    "career.common.career_history_panel.1vrs10j": "Archived position",
    "career.common.career_history_panel.1xfuqgb": "View Board",
    "career.common.career_history_panel.applied": "Applied",
    "career.common.career_history_panel.archived_tooltip": "Archived position",
    "career.common.career_history_panel.hidden_tab": "Archive",
    "career.common.career_history_panel.interested_status": "Interested",
    "career.common.career_history_panel.saved_positions_tab": "Saved positions",
    "career.common.career_hook_messages.02tdf5b":
      "Could not refresh the opportunity list.",
    "career.common.career_hook_messages.043pjii":
      "I couldn't automatically import your LinkedIn or resume info.",
    "career.common.career_hook_messages.051j8yt":
      "Could not load your settings.",
    "career.common.career_hook_messages.0598bor":
      "Could not initialize your talent profile.",
    "career.common.career_hook_messages.06v3zcd":
      "Saved your profile and resume/link info.",
    "career.common.career_hook_messages.082utew":
      "Couldn't re-import profile info.",
    "career.common.career_hook_messages.0848zqr": "Resume/link info saved.",
    "career.common.career_hook_messages.09pr3ij":
      "Saved resume/link, but auto profile setup failed. ({reason})",
    "career.common.career_hook_messages.09wz9hs": "Reference link: {link}",
    "career.common.career_hook_messages.0aw1w91":
      "Failed to save Harper insight.",
    "career.common.career_hook_messages.0c68jwx":
      "Hi, it's great to talk with you directly. I'll ask you some questions one by one. Feel free to answer comfortably - it helps me find better opportunities for you.",
    "career.common.career_hook_messages.0dp8x5s":
      "Failed to save profile preferences.",
    "career.common.career_hook_messages.0em2gjm":
      "I couldn't read the resume text. Please try a different file.",
    "career.common.career_hook_messages.0em3sq3":
      "I couldn't re-import your profile information. ({reason})",
    "career.common.career_hook_messages.0gcst4g":
      "There was an error saving your selection.",
    "career.common.career_hook_messages.0gmwfn1":
      "This call has already ended.",
    "career.common.career_hook_messages.0gv3kjj":
      "I couldn't load the session.",
    "career.common.career_hook_messages.0ikqe9o":
      "Could not save your selection.",
    "career.common.career_hook_messages.0jhqb6p":
      "Thanks for sharing your story. I'll find opportunities that fit well based on what you told me. Let's wrap up our chat for today.",
    "career.common.career_hook_messages.0kbrk6c":
      "Call Wrap-up response was empty.",
    "career.common.career_hook_messages.0la0cjn":
      "Couldn't load conversation messages.",
    "career.common.career_hook_messages.0ljgbz5":
      "Failed to generate closing message.",
    "career.common.career_hook_messages.0mp3zyf":
      "An error occurred while submitting your basic information.",
    "career.common.career_hook_messages.0nb9l75":
      "Saved your resume/link, but automatic profile updates failed. ({reason})",
    "career.common.career_hook_messages.0ptxnu1":
      "An error occurred while preparing the chat.",
    "career.common.career_hook_messages.0q7hdea": "Failed to start onboarding.",
    "career.common.career_hook_messages.0r1cfx7":
      "Couldn't load the opportunity list.",
    "career.common.career_hook_messages.0srl5yk":
      "Some information couldn't be imported, but I updated your profile with what was available.",
    "career.common.career_hook_messages.0tuztsz":
      "An error occurred while sending your message.",
    "career.common.career_hook_messages.0u89sn8":
      "Saved your resume/link and updated your profile with new info.",
    "career.common.career_hook_messages.0vgs7ig":
      "Failed to upload resume file.",
    "career.common.career_hook_messages.0wokf45":
      "Google sign-in failed. Please try again shortly.",
    "career.common.career_hook_messages.0zitxiy":
      "Please enter a password with at least 6 characters.",
    "career.common.career_hook_messages.101suqx":
      "I couldn't verify your login session. Please sign in again.",
    "career.common.career_hook_messages.11ltltf":
      "There was a problem with authentication. Please try again shortly.",
    "career.common.career_hook_messages.11yir7x":
      "I couldn't update the opportunity status.",
    "career.common.career_hook_messages.12bbx7p": "Failed to save profile.",
    "career.common.career_hook_messages.19kzumo": "Failed to save settings.",
    "career.common.career_hook_messages.1a26ni5":
      "Failed to prepare to continue later.",
    "career.common.career_hook_messages.1ady7dv":
      "Please upload your resume or a key link.",
    "career.common.career_hook_messages.1b9i4mv":
      "A verification email has been sent. Open the link in the email to complete sign-up, then log in again.",
    "career.common.career_hook_messages.1bxad2p":
      "Couldn't read text from the PDF.",
    "career.common.career_hook_messages.1eco5r7":
      "Please enter your email and password.",
    "career.common.career_hook_messages.1g1lzhz":
      "An error occurred while preparing to continue later.",
    "career.common.career_hook_messages.1gaikb4":
      "No resume or LinkedIn link available to re-import.",
    "career.common.career_hook_messages.1gxr7hd": "Failed to send the message.",
    "career.common.career_hook_messages.1it3b7e": "Couldn't save the note.",
    "career.common.career_hook_messages.1j9l810":
      "Failed to regenerate the Call Wrap-up.",
    "career.common.career_hook_messages.1ja09cr":
      "Couldn't prepare the conversation.",
    "career.common.career_hook_messages.1kdy4hj":
      "Failed to create the feedback follow-up message.",
    "career.common.career_hook_messages.1mnjdmp":
      "The message stream ended before finishing.",
    "career.common.career_hook_messages.1ntx9r3":
      "Couldn't load more opportunities.",
    "career.common.career_hook_messages.1ojtglo":
      "Your email isn't verified yet. Please check the verification link sent to your email first.",
    "career.common.career_hook_messages.1qsjb9o":
      "This email is already registered. Please sign in to continue.",
    "career.common.career_hook_messages.1rktk41":
      "The email or password is incorrect.",
    "career.common.career_hook_messages.1sh0keg":
      "An error occurred while regenerating the Call Wrap-up.",
    "career.common.career_hook_messages.1u6tsv3":
      "Too many requests. Please try again shortly.",
    "career.common.career_hook_messages.1uqz7wr":
      "Could not load the opportunity.",
    "career.common.career_hook_messages.invalid_linkedin_profile_url":
      "This URL is not valid.",
    "career.common.career_in_page_tabs.1h43miz": "Confirmation required",
    "career.common.career_mobile_chat_launcher.0hu1shh":
      "Harper is preparing a response...",
    "career.common.career_mobile_chat_launcher.0pnsgrt": "Open",
    "career.common.career_mobile_chat_launcher.0q9yygi": "Harper replied",
    "career.common.career_mobile_chat_launcher.0twl8ov": "Collapse Chat",
    "career.common.career_mobile_chat_launcher.1bjhre2":
      "Drag down or tap close to collapse.",
    "career.common.career_mobile_chat_launcher.1j1ugk2": "Harper Chat",
    "career.common.career_mobile_chat_launcher.chat_interview_cta":
      "Finish the 5-minute career chat",
    "career.common.career_mobile_top_bar.0kpy78r": "Tuesday",
    "career.common.career_mobile_top_bar.0wg5ren": "Friday",
    "career.common.career_mobile_top_bar.1f1oien": "Wednesday",
    "career.common.career_mobile_top_bar.1ih373f": "Monday",
    "career.common.career_mobile_top_bar.1jmvi1w": "Thursday",
    "career.common.career_mobile_top_bar.1s93gcz": "Sunday",
    "career.common.career_mobile_top_bar.1xwrfxz": "Saturday",
    "career.common.career_support_inquiry_modal.012iiio":
      "Please let me know any improvements or questions.",
    "career.common.career_support_inquiry_modal.0au4clq":
      "Please write freely below.",
    "career.common.career_support_inquiry_modal.0snjgs4":
      "Please enter your question.",
    "career.common.career_support_inquiry_modal.0ustycb":
      "An error occurred while submitting your inquiry.",
    "career.common.career_support_inquiry_modal.10hs5il":
      "Please enter any suggestions or questions.",
    "career.common.career_support_inquiry_modal.11apzn2": "Close",
    "career.common.career_support_inquiry_modal.16ya5aa": "Close inquiry modal",
    "career.common.career_support_inquiry_modal.17hinuj":
      "Your inquiry has been received.",
    "career.common.career_support_inquiry_modal.1fep109":
      "Please enter a valid email address.",
    "career.common.career_support_inquiry_modal.1ii5ibp": "Submit",
    "career.common.career_support_inquiry_modal.1kjxfan": "Submitting",
    "career.common.career_support_inquiry_modal.1kxvbd7":
      "Please enter your email address.",
    "career.common.career_support_inquiry_modal.1o8h20r":
      "Failed to save your inquiry.",
    "career.common.career_support_inquiry_modal.1x7y6fe":
      "What would you like Harper to do as your career agent?",
    "career.common.career_support_inquiry_modal.reply_email_notice":
      "I'll respond to {email} after reviewing your inquiry.",
    "career.common.career_support_inquiry_modal.submit_inquiry": "Send Inquiry",
    "career.common.career_update_notes_modal.0ha8vft": "Suggest",
    "career.common.career_update_notes_modal.1e7ecir": "Update Notes Content",
    "career.common.career_update_notes_modal.1rg2zqc": "Harper Update Notes",
    "career.common.career_workspace_nav.02pzw1u": "Improvements and inquiries",
    "career.common.career_workspace_screen.0b0v9cr": "Profile",
    "career.common.career_workspace_screen.0jpahnv": "Jobs",
    "career.common.career_workspace_screen.18vor62": "Adjust chat panel width",
    "career.common.career_workspace_screen.1kr4bnb": "Home",
    "career.common.career_workspace_screen.1nwthrd": "Loading Career Page",
    "career.common.career_workspace_screen.mobile_inbox":
      "Recommended Opportunities",
    "career.common.career_workspace_screen.mobile_jobs": "Saved Jobs",
    "career.common.constants.079mmhw": "LinkedIn",
    "career.common.constants.0iah44y": "Personal Website",
    "career.common.conversation_starters.07qcswd": "Speak to Refine Matches",
    "career.common.conversation_starters.0o5blh4": "Tell Harper What's New",
    "career.common.conversation_starters.1gwajda":
      "I'd like to update my preferences.",
    "career.common.conversation_starters.1hl3ggw":
      "Tell me more about your experience",
    "career.common.conversation_starters.1qmlix7":
      "I can share a bit more about my background and experience.",
    "career.common.conversation_starters.1sfi8z4":
      "Speak to Update Preferences",
    "career.common.conversation_starters.more_open_positions":
      "Get more job recommendations",
    "career.common.conversation_starters.requesting_more_open_positions":
      "Requesting...",
    "career.common.internal_connection_acceptance_modal.01cracx":
      "Ready to accept this connection and move forward?",
    "career.common.internal_connection_acceptance_modal.028q399":
      "When you accept, Harper begins preparing your introduction. After an internal review, your key profile and why you're a great fit will be shared directly with the company.",
    "career.common.internal_connection_acceptance_modal.0emad1t":
      "Once introduced, the company will reach out to you with scheduling details.",
    "career.common.internal_connection_acceptance_modal.0ujjrpc":
      "Prompt responses after accepting and showing up to confirmed interviews are why companies place special trust in Harper. Your responsiveness and participation history shape future matching, and members who consistently build trust get first access to the best opportunities.",
    "career.common.internal_connection_acceptance_modal.11m93na":
      "This policy helps ensure opportunities remain available to people who need them.",
    "career.common.internal_connection_acceptance_modal.1tvfp0q":
      "In some cases, Harper may consider whether you gave advance notice, the reason, and whether missed responses, no-shows, or last-minute cancellations are repeated when deciding on access restrictions. If a restriction is applied, new company connection requests and recommendations will stop. Access can only be restored after a review you request.",
    "career.common.internal_connection_acceptance_modal.acknowledgement":
      "I understand Harper's commitment to mutual respect.",
    "career.common.internal_connection_acceptance_modal.close": "Close",
    "career.common.internal_connection_acceptance_modal.community_title":
      "Harper is a community of members who respect each other's time.",
    "career.common.internal_connection_acceptance_modal.community_withdrawal":
      'If things change, just let us know anytime via "Withdraw from process." No questions asked, no impact on your matching.',
    "career.common.internal_connection_acceptance_modal.memo_description":
      "Harper will use this note to prepare for the next steps.",
    "career.common.internal_connection_acceptance_modal.memo_placeholder":
      "(Optional) Let Harper know anything to keep in mind for the next steps, or anything you'd like shared with the company.",
    "career.common.internal_connection_acceptance_modal.pre_share_confirmation":
      "Right before your information is shared with the company, Harper will send you one final confirmation email. You can cancel anytime until then.",
    "career.common.internal_connection_acceptance_modal.submit":
      "Accept Connection",
    "career.common.internal_connection_onboarding_modal.037ebaa":
      "Connecting call...",
    "career.common.internal_connection_onboarding_modal.059fa2p": "Chat",
    "career.common.internal_connection_onboarding_modal.0pmrpu5":
      "Think of this as a casual chat with Harper. Just briefly tell me what you prefer and what kind of connections you want.",
    "career.common.internal_connection_onboarding_modal.0vo80wd":
      "You need to complete a 5-minute career interview before accepting connections.",
    "career.common.internal_connection_onboarding_modal.0z48n2w": "Confirm",
    "career.common.internal_connection_onboarding_modal.18w9rer":
      "Summarizing context to share with the company.",
    "career.common.internal_connection_onboarding_modal.1lyfoil":
      "I'm confirming your desired role and work conditions.",
    "career.common.internal_connection_onboarding_modal.1sbmfzi": "Chat",
    "career.common.internal_connection_onboarding_modal.1sj53gq":
      "Once this conversation ends, I can connect you based on your criteria.",
    "career.common.internal_connection_onboarding_modal.1wjj1zl": "Call",
    "career.common.internal_connection_onboarding_modal.1yorbt8":
      "Connecting to internal opportunities means introducing and recommending you to the company. Please share info the company might want to know so I can proceed.",
    "career.common.opportunity_feedback_note.0aslysy": "Accepted",
    "career.common.opportunity_type_meta.0066ceh":
      "Job conditions don't match (remote, location, etc.)",
    "career.common.opportunity_type_meta.01zzlpt": "Opportunities Harper found",
    "career.common.opportunity_type_meta.03vuko5":
      "This note helps me adjust your next recommendations. You can submit without selecting.",
    "career.common.opportunity_type_meta.06j4qod": "Other (manual input)",
    "career.common.opportunity_type_meta.08t1dhj":
      "Harper's Connection Suggestion",
    "career.common.opportunity_type_meta.09zmhwn":
      "Harper uses this note to organize context for future recommendations and chats.",
    "career.common.opportunity_type_meta.0aqqdks":
      "This company requested to connect with you directly through Harper. I'll share contact info and arrange next steps only after you accept.",
    "career.common.opportunity_type_meta.0fr7lmx":
      "Would you like to decline the connection request?",
    "career.common.opportunity_type_meta.0hc5boq":
      "Harper will use this note to prepare for next steps after accepting the connection. You can submit it now.",
    "career.common.opportunity_type_meta.0ms0wrm":
      "Please share what you liked and any points I should keep in mind for the next step.",
    "career.common.opportunity_type_meta.0ume46n": "Applied",
    "career.common.opportunity_type_meta.0w9kcow":
      "I'll bring you better opportunities next time.",
    "career.common.opportunity_type_meta.0woigko": "Request Intro",
    "career.common.opportunity_type_meta.1225b7g":
      "Please tell me what didn't fit and any criteria you want to avoid in future recommendations.",
    "career.common.opportunity_type_meta.12xbtqt": "Decline",
    "career.common.opportunity_type_meta.16ujfch":
      "External job description (JD)",
    "career.common.opportunity_type_meta.19l43m1":
      "Harper has explored public job pages and job descriptions (JDs) to match this position with your experience, preferences, and next career step. You apply directly through the external JD, and saved items help improve recommendations and explore possible connections.",
    "career.common.opportunity_type_meta.1b7fcpk":
      "Please briefly share why you want to decline or hold.",
    "career.common.opportunity_type_meta.1be34hr":
      "Please briefly explain why this feels burdensome or doesn't fit your current path.",
    "career.common.opportunity_type_meta.1c01yxx":
      "I'll find better opportunities next time.",
    "career.common.opportunity_type_meta.1d0ajqw":
      "If you have reasons for accepting the connection or conditions you'd like to check first, please leave a brief note. You can also submit right away.",
    "career.common.opportunity_type_meta.1ebvtk6":
      "Please leave just one line before saving.",
    "career.common.opportunity_type_meta.1gbs2on": "Company recommendations",
    "career.common.opportunity_type_meta.1ggf9hs":
      "I'm not ready to meet companies directly yet.",
    "career.common.opportunity_type_meta.1i6mw5l":
      "The company or conditions don't meet the criteria.",
    "career.common.opportunity_type_meta.1l3r1qb":
      "(Optional) Add any notes you'd like to share.",
    "career.common.opportunity_type_meta.1llzatw":
      "This isn't your preferred domain, company, or service type.",
    "career.common.opportunity_type_meta.1n5sz4w": "Accept Connection",
    "career.common.opportunity_type_meta.1q2m2s8":
      "I'll pass this on to the company without any pressure on you. If you can, please tell me why you're declining. I'll use that to help you get better opportunities next time.",
    "career.common.opportunity_type_meta.1q9hdqb":
      "Harper can connect you directly with this opportunity. If you accept, your information will be shared directly with the company, and there is a strong chance the process will move to a meeting. Harper will use the feedback below to improve future recommendations and client matching decisions.",
    "career.common.opportunity_type_meta.1qbevng": "Request Direct Connection",
    "career.common.opportunity_type_meta.1rq4mqk":
      "Connect with the hiring manager.",
    "career.common.opportunity_type_meta.1t09h2g":
      "Harper checks the company's hiring needs and asks if you want to connect first. Your profile isn't shared until you accept. After you accept, Harper handles the introduction and follow-up.",
    "career.common.opportunity_type_meta.1tsaf8t":
      "Role or job isn't a good fit",
    "career.common.opportunity_type_meta.1woxqfo": "Company / Source",
    "career.common.opportunity_type_meta.1yj6p99": "Open Position",
    "career.common.opportunity_type_meta.1yobmng":
      "After you accept the connection, we'll move to the next step.",
    "career.common.opportunity_type_meta.1yy34n1":
      "(Optional) Please share what you liked or points Harper should consider for next steps.",
    "career.common.opportunity_type_meta.connected_stage_label": "Connected",
    "career.common.opportunity_type_meta.external_already_applied":
      "You've already applied to this company/role.",
    "career.common.opportunity_type_meta.external_expired_posting":
      "This posting has expired.",
    "career.common.opportunity_type_meta.external_negative_action": "Not a fit",
    "career.common.opportunity_type_meta.external_positive_action":
      "Interested",
    "career.common.opportunity_type_meta.internal_negative_action":
      "I'll decline",
    "career.common.talent_career_modal.18ppi14": "Close modal",
    "career.common.use_career_voice_input.02eo5ko":
      "Failed to connect in real-time. Please continue via chat.",
    "career.company.career_company_detail_drawer.0amy3om":
      "I couldn't load the company information.",
    "career.company.career_company_detail_drawer.0ihv86b": "Company Details",
    "career.company.career_company_detail_drawer.1v2v38p": "Close Company Info",
    "career.company.company_card.1gncj7z": "I'm organizing company updates.",
    "career.company.company_card.1m5x6m1": "Recent Signals",
    "career.company.company_card.1n9j2yp":
      "Organizing the company description.",
    "career.company.company_data.last_funding_round_description":
      "Latest round {description}",
    "career.company.company_data.last_funding_round_description_label":
      "Latest round",
    "career.company.company_data.last_funding_stage": "Latest stage {stage}",
    "career.company.company_data.last_funding_stage_label": "Latest stage",
    "career.company.company_data.main_investors": "Key investors {investors}",
    "career.company.company_data.main_investors_label": "Key investors",
    "career.company.company_data.total_funding_raised":
      "Total funding {amount}",
    "career.company.company_data.total_funding_raised_label": "Total funding",
    "career.company.company_detail_view.01kpxqk": "Number of employees",
    "career.company.company_detail_view.02ioip6": "Year founded",
    "career.company.company_detail_view.05y0iqp": "Company not found.",
    "career.company.company_detail_view.0d3086e": "IPO Status",
    "career.company.company_detail_view.0gx8zud": "Region Group",
    "career.company.company_detail_view.0h3m8a3":
      "Failed to load founder information.",
    "career.company.company_detail_view.0izicuk": "Company Description",
    "career.company.company_detail_view.0lq2ran": "Operational Status",
    "career.company.company_detail_view.0qsmhob": "Expertise",
    "career.company.company_detail_view.0vk24i0": "Company Type",
    "career.company.company_detail_view.18zvias": "Website",
    "career.company.company_detail_view.198i5rb": "Headquarters location",
    "career.company.company_detail_view.199tx5d": "Category",
    "career.company.company_detail_view.1gy0i9e": "Related links",
    "career.company.company_detail_view.1im9ivy": "What Harper found",
    "career.company.company_detail_view.1si5hsi": "Careers Page",
    "career.company.company_detail_view.1sihgzp": "Founder",
    "career.company.company_detail_view.1u6998j": "Investor",
    "career.company.company_empty_state.0akildu":
      "Save companies that match your profile, have active hiring signals in the last 6 months, and are connected on LinkedIn.",
    "career.company.company_empty_state.17mqvmz":
      "You haven't followed any companies yet.",
    "career.company.employee_count.max": "{end} or fewer employees",
    "career.company.employee_count.min": "{start}+ employees",
    "career.company.employee_count.range": "{start}-{end} employees",
    "career.company.follow.discovery_channel_summary":
      "Company-side discovery enabled. If this company looks for talent or sends Harper a hiring request, follower signals are prioritized.",
    "career.company.follow.tracking_summary":
      "Tracking signals. Harper summarizes only meaningful changes across funding, hiring, founder posts, and team updates.",
    "career.company.follow_button.19dhowc": "Following",
    "career.company.follow_button.1p6sttz": "Follow",
    "career.company.followed_at": "Following since {relative}",
    "career.company.following": "Following",
    "career.company.founded_year": "Founded in {year}",
    "career.company.snapshot.follow_up":
      "Do you have any other questions? Harper can also provide insights based on information not easily accessible externally.",
    "career.company.snapshot.investigation_date": "Investigation date",
    "career.company.snapshot.message.completed":
      "Research for {companyName} is complete.",
    "career.company.snapshot.message.error":
      "An error occurred while researching {companyName}. Please try again shortly.",
    "career.company.snapshot.message.loaded_recent":
      "Loaded recent snapshot for {companyName}.",
    "career.company.snapshot.message.loaded_snapshot":
      "Loaded snapshot for {companyName}.",
    "career.company.snapshot.message.saved_snapshot":
      "Saved snapshot for {companyName}.",
    "career.company.snapshot.message.summary_failed":
      "Failed to generate a chat summary of the company research. Please try again shortly.",
    "career.company.snapshot.prompt.json_only":
      "Respond only with a single JSON object, strictly adhering to the JSON schema below. Do not include markdown code fences or explanatory text.",
    "career.company.snapshot.prompt.reason_line":
      "\nContext for why the user is interested in this company: {reason}",
    "career.company.snapshot.prompt.research_priority":
      "Prioritize the latest public information and consider the Korean market context where possible.",
    "career.company.snapshot.prompt.research_scope":
      "Actively use the Web search tool to research this company's business, products, business model, funding/financial status, team/culture, hiring context, and risks/controversies.",
    "career.company.snapshot.prompt.role":
      "You are Harper's company research assistant for a career agent product.",
    "career.company.snapshot.prompt.sources_rule":
      "Include up to 10 actual source URLs. For sections where information is scarce, state 'Could not find definitive information.' as is.",
    "career.company.snapshot.prompt.strict_json":
      "Strictly adhere to JSON syntax and do not include trailing commas after the last item in an object or array.",
    "career.company.snapshot.prompt.target_company":
      "Target company: {companyName}",
    "career.company.snapshot.sources_label": "Sources:",
    "career.company.watchlist_types.0kgfx63": "Signal",
    "career.history.career_mobile_jobs_view.0f42kd7":
      "No new positions have been recommended yet.",
    "career.history.career_mobile_jobs_view.0llq6g8":
      "No archived positions yet.",
    "career.history.career_mobile_jobs_view.0ujd7dh": "Swipe left or right",
    "career.history.career_mobile_jobs_view.1gufjot": "My notes",
    "career.history.career_mobile_jobs_view.1m3uw9j":
      "No interested positions yet.",
    "career.history.career_mobile_jobs_view.mobile_active_empty":
      "You haven't applied to any positions yet.",
    "career.history.career_mobile_jobs_view.mobile_closed_empty":
      "You have no closed positions.",
    "career.history.career_mobile_jobs_view.mobile_connected_empty":
      "You have no positions in progress.",
    "career.history.career_mobile_jobs_view.mobile_hidden_empty":
      "You have no hidden positions.",
    "career.history.feedback_modal.08qkm91": "Add Note",
    "career.history.feedback_modal.109eupo": "Edit Note",
    "career.history.feedback_modal.12volkp":
      "Please write down anything to remember or check about this position.",
    "career.history.feedback_modal.1m0q35j":
      "Add notes here to refer back to when you review this position later.",
    "career.history.feedback_modal.1xp6hfy": "Save",
    "career.history.history_oppotunity_info_modal.01tamdx":
      "What's the request?",
    "career.history.history_oppotunity_info_modal.02wru4l":
      "Continuing our follow-up conversation.",
    "career.history.history_oppotunity_info_modal.06bkpp0":
      "Saving doesn't mean applying or sharing your profile. It only marks your interest and doesn't automatically send your info to the company.",
    "career.history.history_oppotunity_info_modal.09mck3y":
      "Looking for connection opportunities.",
    "career.history.history_oppotunity_info_modal.0al8ecy":
      "Explain clearly why you're a good fit and which experiences make you strong, so the company understands easily.",
    "career.history.history_oppotunity_info_modal.0cqwlx4":
      "This type isn't an offer with a direct connection to the company first. If interested, you'll go to the official job description (JD) link to apply directly.",
    "career.history.history_oppotunity_info_modal.0foa5im":
      "What kind of opportunity are you interested in?",
    "career.history.history_oppotunity_info_modal.0ivukr8":
      "Sharing necessary contact information.",
    "career.history.history_oppotunity_info_modal.0kiczm5":
      "Harper confirmed the company's hiring needs and thinks you're a strong match, so this recommendation asks if you're interested first. This opportunity is more direct than a JD found online, since Harper can connect you with the company.",
    "career.history.history_oppotunity_info_modal.0ntn8vq":
      "We won't share your profile or contact info with a company until you accept their connection request. First, we check if you want to talk with them.",
    "career.history.history_oppotunity_info_modal.0q1p4fw":
      "The company viewed your profile through Harper and requested a direct connection. This is more like direct company interest than a usual recommendation.",
    "career.history.history_oppotunity_info_modal.0xomde1":
      "Harper confirms you're interested in talking with this company.",
    "career.history.history_oppotunity_info_modal.0xzc7b4":
      "We connect mainly via email so companies can reach out directly.",
    "career.history.history_oppotunity_info_modal.0y0d6sb":
      "It's okay to decline or hold off. Your choices are shared with companies in a low-pressure way, and your reasons help us better filter future connection requests.",
    "career.history.history_oppotunity_info_modal.0zwq8z8":
      "I'll check internally if there's a way for Harper to connect with your saved companies.",
    "career.history.history_oppotunity_info_modal.11hvo3b":
      "I'll use this to reflect your interests in companies, roles, and problem types for your next recommendations.",
    "career.history.history_oppotunity_info_modal.12nroon":
      "Your recommendation criteria will become clearer.",
    "career.history.history_oppotunity_info_modal.15i7mq0":
      "After accepting connection",
    "career.history.history_oppotunity_info_modal.19qxk26":
      "After you accept the connection,",
    "career.history.history_oppotunity_info_modal.19yfamm":
      "Harper will follow up on company responses, interview chances, and key conditions to check.",
    "career.history.history_oppotunity_info_modal.1ec32jj":
      "Your contact info or additional details won't be shared with the company until you accept the connection. We'll confirm your interest before moving forward.",
    "career.history.history_oppotunity_info_modal.1fhbkg8":
      "Confirm your acceptance.",
    "career.history.history_oppotunity_info_modal.1g5priu":
      "If you have schedule details, role scope, or conditions to confirm first, Harper will help organize them with you.",
    "career.history.history_oppotunity_info_modal.1jhuftr":
      "I'll only start connecting you with companies after you say it's okay.",
    "career.history.history_oppotunity_info_modal.1myxm8s":
      "These opportunities are selected by Harper based on info from company career pages, ATS, and public listings. We review them alongside your experience, preferred roles, work conditions, and options you want to avoid.",
    "career.history.history_oppotunity_info_modal.1q6mgg6":
      "Record your acceptance intention.",
    "career.history.history_oppotunity_info_modal.1qug6jy":
      "What kind of offer is this?",
    "career.history.history_oppotunity_info_modal.1qugev1":
      "How Harper uses this when saved",
    "career.history.history_oppotunity_info_modal.1raav60":
      "Coordinate next steps with the company.",
    "career.history.history_oppotunity_info_modal.1tuk6ef":
      "Summarize recommendation context.",
    "career.history.history_oppotunity_info_modal.1ucb8t9":
      "If you change your mind after accepting, just let Harper know. If you select 'Not a fit,' we'll use the reason to reduce similar opportunities in future recommendations.",
    "career.history.history_shortcut_panel.0kgqz9q": "Move",
    "career.history.history_shortcut_panel.1kpvg7d": "Previous Role",
    "career.history.history_shortcut_panel.1s07tch": "Next Position",
    "career.history.internal_decision_actions.revert": "Move to New Position",
    "career.history.internal_decision_actions.revert_accept_description":
      "This will cancel the connection and move the position back to 'New'. Information already shared and messages already sent can't be recalled automatically.",
    "career.history.internal_decision_actions.revert_accept_title":
      "Undo accepting this connection?",
    "career.history.internal_decision_actions.revert_confirm":
      "Move to New Position",
    "career.history.internal_decision_actions.revert_reject_description":
      "This will undo the rejection and move the position back to 'New'. You can then accept or reject it again.",
    "career.history.internal_decision_actions.revert_reject_title":
      "Undo this rejection?",
    "career.history.internal_decision_actions.stop": "Stop Pursuing",
    "career.history.internal_decision_actions.stop_confirm": "Stop Pursuing",
    "career.history.internal_decision_actions.stop_description":
      "Harper will notify the company that you want to stop and move this position to 'Ended'. If you're already in touch with a company contact or have something scheduled, please let them know directly that you're canceling.",
    "career.history.internal_decision_actions.stop_reason_placeholder":
      "(Optional) Tell Harper why you're ending the process (e.g., you accepted another offer or are no longer able to change jobs).",
    "career.history.internal_decision_actions.stop_title":
      "Stop pursuing this position?",
    "career.history.opportunity_detail_content.add_memo": "Add Note",
    "career.history.opportunity_detail_content.company_source":
      "Company / Source",
    "career.history.opportunity_detail_content.edit_memo": "Edit Note",
    "career.history.opportunity_detail_content.hide_detail": "Hide Details",
    "career.history.opportunity_detail_content.memo": "My Notes",
    "career.history.opportunity_detail_content.show_detail": "Show Details",
    "career.history.opportunity_detail_content.status_menu":
      "Change to {status} status",
    "career.history.opportunity_detail_modal.1b2ybel":
      "Revert to New Opportunity",
    "career.history.opportunity_detail_modal.aria_label": "{title} details",
    "career.history.opportunity_list_card.0l12x89": "Points to watch:",
    "career.history.opportunity_list_card.status_menu":
      "Change to {status} status",
    "career.history.posting.closed": "Closed posting.",
    "career.history.posting.posted_ago": "Posted {postedAgo}",
    "career.history.saved_opportunity_board.0965oie": "Drop here",
    "career.history.saved_opportunity_board.load_more": "Load more",
    "career.history.saved_opportunity_board.loading_column": "Loading column",
    "career.history.saved_opportunity_board.loading_more": "Loading more",
    "career.history.saved_opportunity_status.0exoa8f": "Archive",
    "career.history.saved_opportunity_status.0obqas2": "Interested",
    "career.history.saved_opportunity_status.1jv953e": "Ended",
    "career.history.saved_opportunity_status.all": "View all",
    "career.history.saved_opportunity_status.applied": "Applied",
    "career.history.saved_opportunity_status.archived": "Archived position",
    "career.history.saved_opportunity_status.connected": "In progress",
    "career.history.saved_opportunity_status.hide_action": "Archive",
    "career.home.career_home_panel.024uw9c": "Reload information",
    "career.home.career_home_panel.05hgw7c":
      "Please answer only simple questions in the chat on the left or the call below.",
    "career.home.career_home_panel.0bq7bs7":
      "Got new skills or a change of mind? Just tell Harper to keep your matches up to date.",
    "career.home.career_home_panel.0c36lcv":
      "Your 5-minute career interview isn't finished yet.",
    "career.home.career_home_panel.0dha8ne": "Checking criteria",
    "career.home.career_home_panel.0e3tusc":
      "When our chat ends, I'll summarize and make sure you get perfectly matched opportunities.",
    "career.home.career_home_panel.0ejjdwp":
      "{company} and {count} more {status}",
    "career.home.career_home_panel.0f1tq9x":
      "You're only receiving recommendations for publicly posted positions. Internal company connection offers are turned off.",
    "career.home.career_home_panel.0gj76aj": "Submit Documents",
    "career.home.career_home_panel.0qe18mm":
      "Confirming your desired opportunity criteria.",
    "career.home.career_home_panel.0rlf0ya":
      "Harper is continuously exploring new opportunities.",
    "career.home.career_home_panel.0rplg97": "5-Minute Call with Harper",
    "career.home.career_home_panel.0sdf230": "Recommended Jobs",
    "career.home.career_home_panel.0vplw45":
      "There seems to be an issue retrieving the information.",
    "career.home.career_home_panel.0x7lgjp": "Recommended for you",
    "career.home.career_home_panel.0zkc0rv":
      "Please try again using the button on the right. Sorry for the inconvenience.",
    "career.home.career_home_panel.11q0oj9": "Saved positions",
    "career.home.career_home_panel.15tndog": "Start Recommendations",
    "career.home.career_home_panel.19aqpg8":
      "Quickly review roles and conditions",
    "career.home.career_home_panel.1dfqgdw":
      "Recommendations for external public positions and internal company connection offers are both turned off.",
    "career.home.career_home_panel.1dtmpgt":
      "I'm getting recommendations for externally posted positions and internal company connection suggestions.",
    "career.home.career_home_panel.1frpdtk": "Loading...",
    "career.home.career_home_panel.1jcg4hg":
      "Harper is currently scanning {count} opportunities, discovering new roles every day.",
    "career.home.career_home_panel.1l3sw8y":
      "I'm only accepting internal company connection offers right now. I'm not taking recommendations for external public roles.",
    "career.home.career_home_panel.1ol18h9": "Career Interview in Progress",
    "career.home.career_home_panel.1psd54b":
      "No saved or connected positions yet.",
    "career.home.career_home_panel.1q70b1u": "Account",
    "career.home.career_home_panel.1qhpcnm": "{count} {status}",
    "career.home.career_mobile_home_view.0lny7ac":
      "I'll get to know you better through our conversation and help you receive opportunities you'll like.",
    "career.home.career_mobile_home_view.0rjturg": "Good evening.",
    "career.home.career_mobile_home_view.0snbgwi": "It's early morning.",
    "career.home.career_mobile_home_view.0t1cxif":
      "Let me know if you need anything.",
    "career.home.career_mobile_home_view.0to563z":
      "Please answer only simple questions via chat or call.",
    "career.home.career_mobile_home_view.0w2aiar":
      "Hope you're having a great day!",
    "career.home.career_mobile_home_view.1amflsx": "How was your day today?",
    "career.home.career_mobile_home_view.1inys5s":
      "If there are changes or requests,<br /> - a call is faster",
    "career.home.career_mobile_home_view.1j9mmu9": "Good morning.",
    "career.home.career_mobile_home_view.1vip5ub": "Saved positions",
    "career.home.career_mobile_home_view.greeting_name_ko": "Hi {name}",
    "career.home.career_mobile_home_view.summary_count_label":
      "{count} {label}",
    "career.home.internal_role_decision_banner.confirm": "Review",
    "career.home.internal_role_decision_banner.fallback_role":
      "A new internal opportunity",
    "career.home.internal_role_decision_banner.multiple":
      "{role} and {count} more need your decision.",
    "career.home.internal_role_decision_banner.single":
      "{role} needs your decision.",
    "career.home.internal_role_decision_banner.week_old_description":
      "Prompt responses and thoughtful feedback are why companies place special trust in candidates Harper recommends. Your responsiveness and participation history shape future matching, so the sooner you decide, the better. Even if you decline, you can request a connection again as long as the role is still open.",
    "career.home.loading": "Loading home",
    "career.internal_opportunity.call_opening":
      "For the {companyName} {roleTitle} connection, I'd like to quickly ask a few things so I can represent you well to the company.",
    "career.internal_opportunity.call_request_created":
      "Additionally, would you be open to a quick call with me?\n\nThis isn't an evaluation call, but I'd like to ask a few role-related questions to better introduce you for the {companyName} {roleTitle} opportunity.\n\n- I'll briefly confirm what the company typically asks about.\n- Your answers will help me create a more tailored introduction.\n- The connection process will continue even if we don't speak.\n\nPlease proceed below when you're ready.",
    "career.job_posting_recommendations.answer.default_fit_reason":
      "This opportunity aligns with your requested scope of work.",
    "career.job_posting_recommendations.answer.details_label": "Details",
    "career.job_posting_recommendations.answer.empty":
      "I couldn't find any external job postings that match your current criteria.\nBroadening the job title, location, or employment type might help me find more options.",
    "career.job_posting_recommendations.answer.requested_count_trimmed":
      "Instead of showing all {requestedCount} requested opportunities at once, I've selected the top {finalCount} that are the best fit for you right now. In future recommendations, I'll broaden the search to include up to {batchLimit} opportunities at a time, excluding any that don't meet the core criteria.",
    "career.job_posting_recommendations.answer.saved_headline":
      "Based on your criteria, I've saved {count} high-priority opportunities to your Positions tab.",
    "career.job_posting_recommendations.answer.search_intent": "Search Intent",
    "career.job_posting_recommendations.answer.supplemental_included":
      "Because {directCount} postings matched your request directly, I also included {supplementalCount} strong adjacent postings that may still be worth reviewing.",
    "career.job_posting_recommendations.answer.supplemental_reason":
      "This opportunity doesn't perfectly match your request but scored highly among potential candidates, so I'm including it for your consideration.",
    "career.job_posting_recommendations.answer.watch_for_label":
      "Things to Note",
    "career.job_posting_recommendations.answer.why_included_label":
      "Why Included",
    "career.job_posting_recommendations.answer.why_it_fits_label":
      "Why It Fits",
    "career.job_posting_recommendations.search_plan.intent_fallback":
      "Find external job postings that match your request.",
    "career.onboarding.defer_fallback_close":
      "Got it. I'll complete your registration for now based on what you shared. When you come back later, I'll help you continue in more detail. You can also use the button below to keep chatting now.",
    "career.onboarding.defer_prompt_text":
      "Got it. I'll complete the basic registration for now. Please come back later when you're ready.\n\nIf you can share just your basic situation first, I can pick things back up faster when needed.\n\nPlease choose what kinds of opportunities you're looking for right now. You can select more than one.",
    "career.onboarding.interest.active_job_search":
      "I'm actively looking for my next role.",
    "career.onboarding.interest.not_looking_now":
      "I'm not looking right now. I'll come back if that changes.",
    "career.onboarding.interest.open_to_good_opportunities":
      "I'm not urgently looking, but I'd like to hear about good opportunities.",
    "career.onboarding.interest.part_time_or_coffee_chat":
      "I'm looking for opportunities I can explore on the side, like part-time work or coffee chats.",
    "career.onboarding.interest.selected_prefix":
      "Opportunities I'm looking for right now:",
    "career.onboarding.link.github": "GitHub",
    "career.onboarding.link.linkedin": "LinkedIn",
    "career.onboarding.link.other": "Other",
    "career.onboarding.link.personal_website": "Personal website",
    "career.onboarding.linkedin_url_invalid": "This URL is not valid.",
    "career.onboarding.onboarding.010bz98": "Could not read resume content.",
    "career.onboarding.onboarding.01ywpeo":
      "Failed to save your profile visibility settings.",
    "career.onboarding.onboarding.03b3ba6":
      "Only profile info needed for matching is shared. You can set companies to keep private.",
    "career.onboarding.onboarding.059do1c":
      "Failed to start structuring your profile.",
    "career.onboarding.onboarding.06ilxsj":
      "Let's find something you can do alongside your current role.",
    "career.onboarding.onboarding.09uxsj9": "Please enter a valid email.",
    "career.onboarding.onboarding.0am0h8h": "Analysis takes about 2 minutes.",
    "career.onboarding.onboarding.0cvpvmv": "Start exploring opportunities",
    "career.onboarding.onboarding.0czo5rp":
      "Your career<br />needs an agent too.",
    "career.onboarding.onboarding.0d18cht":
      "Please enter either your resume or a LinkedIn link.",
    "career.onboarding.onboarding.0ehh5yz": "Please enter your name.",
    "career.onboarding.onboarding.0eumq1b":
      "I couldn't save your basic information.",
    "career.onboarding.onboarding.0fcepf9": "Personal Page",
    "career.onboarding.onboarding.0ghhb4f": "I'll tailor suggestions for you.",
    "career.onboarding.onboarding.0hobsv6":
      "Started searching for opportunities.",
    "career.onboarding.onboarding.0j4a2qn": "Harper will understand first.",
    "career.onboarding.onboarding.0lliiks": "Harper shares first",
    "career.onboarding.onboarding.0nzlxqj":
      "Harper brings opportunities first, and your profile is shared only after you approve.",
    "career.onboarding.onboarding.0pijbir":
      "Onboarding session isn't ready yet.",
    "career.onboarding.onboarding.0sc411b":
      "Additional info helps us narrow your direction more precisely.",
    "career.onboarding.onboarding.0t0s7bt":
      "When should I share your profile with companies?",
    "career.onboarding.onboarding.0w4wbae":
      "Please select the type of work you're looking for.",
    "career.onboarding.onboarding.0wbopf1": "Next",
    "career.onboarding.onboarding.0wcgte0": "I'll check first",
    "career.onboarding.onboarding.0wrohr9": "Previous",
    "career.onboarding.onboarding.0yf8432": "Basic Information",
    "career.onboarding.onboarding.0yuh7d0": "Resume upload failed.",
    "career.onboarding.onboarding.0zapw5l": "Connect Profile",
    "career.onboarding.onboarding.0zc98l7":
      "Now, just set a few criteria with Harper.",
    "career.onboarding.onboarding.0zg5btj": "Privacy Settings",
    "career.onboarding.onboarding.13259px":
      "Full-time positions worth reviewing right away",
    "career.onboarding.onboarding.13vjc2d": "Upload Resume/CV",
    "career.onboarding.onboarding.15izros":
      "I'm open to changing jobs if it's the right opportunity.",
    "career.onboarding.onboarding.166o9pn": "Full-time",
    "career.onboarding.onboarding.17aqzmx":
      "Just a LinkedIn profile or resume is enough.",
    "career.onboarding.onboarding.17sy1or": "Email",
    "career.onboarding.onboarding.183d95f":
      "Your conversation details won't be shared with companies.",
    "career.onboarding.onboarding.1a74y8o":
      "I want to help the initial team or contribute strategically.",
    "career.onboarding.onboarding.1at9nca":
      "If I think it's a good fit, I'll share your profile with the company first. I'll let you know right away if they're interested.",
    "career.onboarding.onboarding.1bulcyv": "Advisor",
    "career.onboarding.onboarding.1das976":
      "Part-time or project opportunities that fit well alongside your current work",
    "career.onboarding.onboarding.1gr43li": "Get started with Harper",
    "career.onboarding.onboarding.1gsa1bx":
      "Advisor opportunities where you can chat comfortably.",
    "career.onboarding.onboarding.1jkvik4": "Start Conversation",
    "career.onboarding.onboarding.1k0o8vf": "Part-time / Project",
    "career.onboarding.onboarding.1kdng2n": "Could not save your preferences.",
    "career.onboarding.onboarding.1n6ukfv":
      "Your profile is shared only in the way you chose.",
    "career.onboarding.onboarding.1njrwx4": "Name",
    "career.onboarding.onboarding.1o4hblb":
      "Just your name and email are enough to get started.",
    "career.onboarding.onboarding.1p04ixt":
      "An error occurred while submitting onboarding.",
    "career.onboarding.onboarding.1sh2r2c":
      "Failed to load onboarding session.",
    "career.onboarding.onboarding.1sjsl9m": "Information Confirmed",
    "career.onboarding.onboarding.1sy0934":
      "Failed to reset login information.",
    "career.onboarding.onboarding.1t9c061":
      "What opportunities are you<br />exploring?",
    "career.onboarding.onboarding.1wh5aat": "Name",
    "career.onboarding.onboarding.1x0fjwc": "Opportunity Type",
    "career.onboarding.onboarding.1xpgwgk":
      "Please upload PDF, DOCX, or text files. Up to 10MB recommended.",
    "career.onboarding.onboarding.default_candidate_name": "you",
    "career.onboarding.onboarding.email_change_requires_verification":
      "You can change your email after signing up by verifying the new address.",
    "career.onboarding.onboarding.official_job_engagement_description":
      "In addition to the {jobs} role you just viewed, Harper can proactively recommend other strong opportunities when they come up. Please select the types of opportunities you're open to now.",
    "career.onboarding.onboarding.official_job_progress_help":
      "I'll help you move forward with {job}.",
    "career.onboarding.onboarding.official_job_visibility_description":
      "Harper may also recommend {name} for opportunities beyond {job}. If you're comfortable being introduced to companies first, you can receive proposals proactively.",
    "career.onboarding.onboarding_done.call_cta": "Take a 5-min call",
    "career.onboarding.onboarding_done.chat_cta": "Chat now",
    "career.onboarding.onboarding_done.default_agent_intro":
      "To help me find better connections, I'd like to ask a few more questions about your current situation and the opportunities you're looking for. It usually takes about 5 minutes.",
    "career.onboarding.onboarding_done.default_kickoff_profile":
      "Now I'll look for opportunities that might be a good fit for you and introduce you to companies that have requested to connect, if they seem like a good match.",
    "career.onboarding.onboarding_done.default_kickoff_thanks":
      "Hi there, thanks for sharing your information.",
    "career.onboarding.onboarding_done.default_name": "User",
    "career.onboarding.onboarding_done.default_user_message":
      "I've sent over my profile.",
    "career.onboarding.onboarding_done.default_user_message_short":
      "I've sent over my profile.",
    "career.onboarding.onboarding_done.description":
      "To help me find better matches, I'd like to ask a few questions about your current situation and desired opportunities. Your honest answers will help me find the best fits for you.\nIt should only take about 5 minutes.",
    "career.onboarding.onboarding_done.privacy_note":
      "Our conversation is kept secure and will only be used to help you find better career opportunities with {name}.",
    "career.onboarding.onboarding_done.ready_badge": "Ready to chat",
    "career.onboarding.onboarding_done.selected_agent_intro":
      "After our chat, I'll start by looking for {targetCopy} and help with introductions and connections.",
    "career.onboarding.onboarding_done.title": "Can we chat for a moment?",
    "career.onboarding.onboarding_loading_state.0hhyibm":
      "Getting ready for our first chat",
    "career.onboarding.onboarding_loading_state.0ouyje6":
      "Checking your profile from LinkedIn and resume.",
    "career.onboarding.onboarding_loading_state.19pgngy":
      "Reading your profile",
    "career.onboarding.onboarding_loading_state.1p92fsi":
      "Looking for strong signals",
    "career.onboarding.onboarding_loading_state.analyzing_badge":
      "Harper is analyzing",
    "career.onboarding.onboarding_loading_state.footer_note":
      "Analysis takes about 1 minute. Please wait a moment while Harper prepares your recommendations.",
    "career.onboarding.onboarding_loading_state.preview_label":
      "Onboarding analysis progress",
    "career.onboarding.onboarding_loading_state.profile_context":
      "Analyzing experience and interests",
    "career.onboarding.submit.resume_or_link_required":
      "Please provide either your resume or at least one key link.",
    "career.onboarding.submitted.link_part_many": "{labels} links",
    "career.onboarding.submitted.link_part_one": "{labels} link",
    "career.onboarding.submitted.links_only": "Submitted {linkPart}.",
    "career.onboarding.submitted.profile_information":
      "Submitted profile information.",
    "career.onboarding.submitted.resume_and_links":
      "Submitted a resume and {linkPart}.",
    "career.onboarding.submitted.resume_only": "Submitted a resume.",
    "career.preview.career_workspace_preview.01j68q1":
      "A US-based B2B SaaS team, turning initial AI features into the product core.",
    "career.preview.career_workspace_preview.022alch":
      "Onboarding is done. What opportunities do you want to prioritize now?",
    "career.preview.career_workspace_preview.045qelm":
      "This role builds a multimodal model evaluation pipeline and deployment system.",
    "career.preview.career_workspace_preview.04a6xnr":
      "This is a preview. In live use, the interview ends and only the conversation summary card shows here.",
    "career.preview.career_workspace_preview.051gu06":
      "You can shape product direction and technical decisions with a small team.",
    "career.preview.career_workspace_preview.05bnk2r":
      "Saved your resume and links.",
    "career.preview.career_workspace_preview.05fo2rr":
      "You can immediately apply your experience in initial system design and quality standards.",
    "career.preview.career_workspace_preview.05gbt68":
      "This role leads recommendation models and conversational UX alongside the product team.",
    "career.preview.career_workspace_preview.0gdmtk0":
      "Got it. I'll focus on applied AI and agent product roles, open to Seoul, Remote, and SF locations.",
    "career.preview.career_workspace_preview.0hhw3xx":
      "Experience with paper-based evaluation systems applies directly here.",
    "career.preview.career_workspace_preview.0kof53s":
      "Got it. I'll review internal opportunities and public openings, then organize the best fits first.",
    "career.preview.career_workspace_preview.0kxr9jl":
      "This team links commerce search and personalization models directly to product KPIs.",
    "career.preview.career_workspace_preview.0ng3mak":
      "0 to 1 Product Launch Experience",
    "career.preview.career_workspace_preview.0o0xl6w":
      "Profile settings saved.",
    "career.preview.career_workspace_preview.0occyrr":
      "Strong product ownership, but domain preferences may vary.",
    "career.preview.career_workspace_preview.0r19bht":
      "This role lets you share responsibility for product and model quality in a small team.",
    "career.preview.career_workspace_preview.0r259wt":
      "Your experience launching LLM products directly applies here.",
    "career.preview.career_workspace_preview.0wa8f7a":
      "I prefer places where product direction and tech decisions move fast, even if the team is small. I'd rather have a product with real usage than meaningless AI buzz.",
    "career.preview.career_workspace_preview.10x4rht":
      "An applied research team bridging academic papers and products.",
    "career.preview.career_workspace_preview.12a8e6s":
      "I designed the conversational agent product and built the retrieval, evaluation, and observability pipelines.",
    "career.preview.career_workspace_preview.18ymrj7":
      "This role involves creating LLM workflows and evaluation systems, and quickly experimenting with customer features alongside the engineering team.",
    "career.preview.career_workspace_preview.19hvkft":
      "A preference for remote work and product-focused applied AI experience fits well.",
    "career.preview.career_workspace_preview.19k8ud9":
      "Full-time is preferred, but fractional advisory is fine if it's a strong fit.",
    "career.preview.career_workspace_preview.19rh5dl":
      "Developed data pipelines and internal tools while collaborating with product teams.",
    "career.preview.career_workspace_preview.1ashy8n": "Harper insight saved.",
    "career.preview.career_workspace_preview.1b3wco5":
      "This opportunity needs to confirm if you prefer a role between research and product.",
    "career.preview.career_workspace_preview.1bdgvh5":
      "Re-imported info from saved resume/link.",
    "career.preview.career_workspace_preview.1c9yhl3":
      "I've mainly worked on deploying LLM products in real user environments and prefer roles managing both model quality and product speed.",
    "career.preview.career_workspace_preview.1dkij5s":
      "This is a preview. In a live setup, this input will connect to server conversations.",
    "career.preview.career_workspace_preview.1gp8ljf":
      "This is a small product team responsible for both model quality and user experience.",
    "career.preview.career_workspace_preview.1hcvc0e":
      "I've mainly focused on rapidly deploying user-facing AI products and designing the balance between model performance and product UX.",
    "career.preview.career_workspace_preview.1ist4od":
      "This role lets you co-design the initial product direction and LLM workflow.",
    "career.preview.career_workspace_preview.1j2um38":
      "I want to first see roles with higher pay and responsibility in a global AI product team.",
    "career.preview.career_workspace_preview.1nzus3x":
      "This role works directly with the product team to deploy agent features and monitor performance together.",
    "career.preview.career_workspace_preview.1rsjscm":
      "I've updated Harper's search criteria with the conditions you shared. Results will be ready soon and sent via the Positions tab and email, which may take up to an hour. After you review them, please use the like/dislike buttons. For companies you like, track them to get updates on news and openings. One quick question: Would you like me to regularly notify you about external job postings that might fit, even if I can't connect you directly? Or would you prefer I only reach out when there's a strong internal match, like with direct connections?",
    "career.preview.career_workspace_preview.1tenwz4":
      "Maintain LLM eval tools and agent workflow packages",
    "career.preview.career_workspace_preview.1truxm7": "Profile saved.",
    "career.profile.career_profile_menu.0rpl24h": "Profile Menu",
    "career.profile.career_profile_menu.1k7ppv0": "Log out",
    "career.profile.career_profile_menu.1vjbdm5": "Contact Us",
    "career.profile.career_profile_settings_section.07836ex": "Add",
    "career.profile.career_profile_settings_section.08zy6at": "Saving...",
    "career.profile.career_profile_settings_section.08zy6at_2": "Saving...",
    "career.profile.career_profile_settings_section.09ffo10":
      "Change profile visibility settings?",
    "career.profile.career_profile_settings_section.0fc879w":
      "Saving your profile publicly",
    "career.profile.career_profile_settings_section.0jiry9t": "Cancel",
    "career.profile.career_profile_settings_section.0o48hts":
      "Blocked Companies",
    "career.profile.career_profile_settings_section.0on2o51": "Undo",
    "career.profile.career_profile_settings_section.0vrogtc":
      "Your anonymous profile is only shared after you review matched opportunities/companies and explicitly approve.",
    "career.profile.career_profile_settings_section.10tme3s":
      "Enter a company name...",
    "career.profile.career_profile_settings_section.117d7sb":
      "Choosing 'Don't share' will pause all recommendations and connections. Companies will be blocked from viewing your profile, even for existing opportunities. Select this option if you wish to temporarily pause the service.",
    "career.profile.career_profile_settings_section.13fr2yp":
      "If a position is a strong match, your profile will be shared with the company first so you can decide after receiving a specific offer.",
    "career.profile.career_profile_settings_section.140kczj":
      "Switching to 'Open to matches' allows Harper to proactively suggest you to companies when Harper identifies a mutually beneficial opportunity. In this case, the company will reach out first, giving you the chance to decide whether to accept after seeing a specific offer. Accepting guarantees a 100% connection.<br /><br />Harper will share only the information necessary for companies to make a decision, without revealing all your details. Harper only shares with companies that seem aligned with your preferences, and never with companies you've explicitly blocked.",
    "career.profile.career_profile_settings_section.18i3x5x": "Save settings",
    "career.profile.career_profile_settings_section.1easkuh":
      "Your profile will never be shared under any circumstances. If you want to temporarily block all matching, please select this option.",
    "career.profile.career_profile_settings_section.1fz4zad":
      "These settings determine the conditions under which your profile is shared.",
    "career.profile.career_profile_settings_section.1izc5gu":
      "With 'Exceptional only,' you'll review opportunities and companies first. Your profile will only be shared with your explicit approval. Your information will never be shared with companies or for roles you haven't reviewed.",
    "career.profile.career_profile_settings_section.1kggtpw":
      "Saving blocked companies...",
    "career.profile.career_profile_settings_section.1mx38an": "Review and save",
    "career.profile.career_profile_settings_section.1mzsli6":
      "No blocked companies.",
    "career.profile.career_profile_settings_section.1qqh6ja": "Loading",
    "career.profile.career_profile_settings_section.1tnqucg": "Public Profile",
    "career.profile.career_profile_settings_section.1z04ms5":
      "Desired visibility",
    "career.profile.career_profile_settings_section.engagement_advisor":
      "You are open to strategic or technical advisory roles.",
    "career.profile.career_profile_settings_section.engagement_fractional":
      "You can consider part-time or project-based work while keeping your current role.",
    "career.profile.career_profile_settings_section.engagement_full_time":
      "You are open to full-time roles.",
    "career.profile.career_profile_settings_section.engagement_types_hint":
      "Select every type of opportunity you are open to right now.",
    "career.profile.career_profile_settings_section.engagement_types_label":
      "Engagement types",
    "career.profile.career_profile_settings_section.remove_blocked_company":
      "Remove {companyName}",
    "career.profile.career_profile_workspace.0pv1jmq": "No saved resumes",
    "career.profile.career_profile_workspace.116ofw4":
      "This won't be sent to the company as is, but you can check if you want to change anything.",
    "career.profile.career_profile_workspace.11os0vs":
      "You can review and edit your resume and related links.",
    "career.profile.career_profile_workspace.14bifvm": "Resume & Links",
    "career.profile.career_profile_workspace.16e35ps":
      "This is the profile Harper created based on the information and conversation you provided.",
    "career.profile.career_talent_profile_panel.00infjs": "Work Location",
    "career.profile.career_talent_profile_panel.04441vu":
      "Please upload a logo image under 5MB.",
    "career.profile.career_talent_profile_panel.051qjyj":
      "Key responsibilities and achievements",
    "career.profile.career_talent_profile_panel.05hwq9n": "Profile photo menu",
    "career.profile.career_talent_profile_panel.06cga7b":
      "Required Qualifications",
    "career.profile.career_talent_profile_panel.06x2f2q": "Major",
    "career.profile.career_talent_profile_panel.07tjd6q": "Description",
    "career.profile.career_talent_profile_panel.07x414y": "Company Link",
    "career.profile.career_talent_profile_panel.093jpik": "Pending",
    "career.profile.career_talent_profile_panel.0a2iqu6": "Upload Logo",
    "career.profile.career_talent_profile_panel.0a7k434": "Degree",
    "career.profile.career_talent_profile_panel.0acdx91":
      "Failed to upload the logo.",
    "career.profile.career_talent_profile_panel.0anxi5z":
      "Only image files can be uploaded.",
    "career.profile.career_talent_profile_panel.0csjlpy": "Location",
    "career.profile.career_talent_profile_panel.0efzyx5": "Add experience",
    "career.profile.career_talent_profile_panel.0o1w258": "Edit profile",
    "career.profile.career_talent_profile_panel.0p5h1wt": "Current",
    "career.profile.career_talent_profile_panel.0q45tnt":
      "You don't have any saved profile info yet. Tap 'Edit' to enter it yourself.",
    "career.profile.career_talent_profile_panel.0qip38b": "Dealbreakers",
    "career.profile.career_talent_profile_panel.0rfzx4s":
      " · Shared only with companies you connect with",
    "career.profile.career_talent_profile_panel.0rtdf2n": "Employment Type",
    "career.profile.career_talent_profile_panel.0seo81b":
      "Failed to save profile picture.",
    "career.profile.career_talent_profile_panel.0tc2iu5":
      "Failed to delete your profile picture.",
    "career.profile.career_talent_profile_panel.0tftkys": "Collapse",
    "career.profile.career_talent_profile_panel.0tgcq59":
      "One-line Introduction",
    "career.profile.career_talent_profile_panel.0uwqvnk": "Company Name",
    "career.profile.career_talent_profile_panel.0wjximy":
      "Additional Information",
    "career.profile.career_talent_profile_panel.0x0us78":
      "Please add your experience, education, and additional details.",
    "career.profile.career_talent_profile_panel.0x4dx7a": "Save",
    "career.profile.career_talent_profile_panel.11cor6u": "Start Date",
    "career.profile.career_talent_profile_panel.13a39zc": "End Date",
    "career.profile.career_talent_profile_panel.18od9kw": "Delete item",
    "career.profile.career_talent_profile_panel.19jif2e": "Compensation",
    "career.profile.career_talent_profile_panel.1afhauj": "School Name",
    "career.profile.career_talent_profile_panel.1axs5u2": "Role Fit",
    "career.profile.career_talent_profile_panel.1d7d70h": "Harper Notes",
    "career.profile.career_talent_profile_panel.1dp84h2": "Delete Photo",
    "career.profile.career_talent_profile_panel.1dup23s":
      "Please upload profile images under 5MB.",
    "career.profile.career_talent_profile_panel.1efofsl": "Add Education",
    "career.profile.career_talent_profile_panel.1gsvvpp":
      "Failed to upload profile picture.",
    "career.profile.career_talent_profile_panel.1iegi7w": "End date or Present",
    "career.profile.career_talent_profile_panel.1iq5xym": "Edit",
    "career.profile.career_talent_profile_panel.1nc9ehf": "See all insights",
    "career.profile.career_talent_profile_panel.1pzl6hl": "Date",
    "career.profile.career_talent_profile_panel.1qnltk8": "Job Title",
    "career.profile.career_talent_profile_panel.1rnsexk": "Change/Upload Photo",
    "career.profile.career_talent_profile_panel.1syy18d": "Other",
    "career.profile.career_talent_profile_panel.1trcux2":
      "Education Description",
    "career.profile.career_talent_profile_panel.1u4ajdw":
      "Auto-calculate duration",
    "career.profile.career_talent_profile_panel.1ub2ks6": "Title",
    "career.profile.career_talent_profile_panel.1ywstxy": "School/Program Link",
    "career.profile.career_talent_profile_panel.remove_confirm_description":
      "This item will be removed from the editor. Save your profile to apply the change.",
    "career.profile.career_talent_profile_panel.remove_confirm_title":
      "Delete {label}?",
    "career.profile.personal_info.phone_modal_title": "Edit Phone Number",
    "career.profile.personal_info.phone_number": "Phone Number",
    "career.profile.personal_info.title": "Personal Information",
    "career.profile.date.present": "Present",
    "career.profile.date.year_only": "{year}",
    "career.profile.duration.month_many": "{months} months",
    "career.profile.duration.month_one": "{months} month",
    "career.profile.duration.year_many_month_many":
      "{years} years {months} months",
    "career.profile.duration.year_many_month_one":
      "{years} years {months} month",
    "career.profile.duration.year_many_month_zero": "{years} years",
    "career.profile.duration.year_one_month_many":
      "{years} year {months} months",
    "career.profile.duration.year_one_month_one": "{years} year {months} month",
    "career.profile.duration.year_one_month_zero": "{years} year",
    "career.profile.language_selector.close": "Close",
    "career.profile.language_selector.menu_label": "Language Settings",
    "career.profile.language_selector.modal_description":
      "Choose the language Harper will use.",
    "career.profile.language_selector.modal_title": "Language Settings",
    "career.profile.language_selector.save_failed":
      "Failed to save your language settings. Please try again in a moment.",
    "career.profile.recruiter_profile.default": "Profile as seen by recruiters",
    "career.profile.recruiter_profile.named": "How companies see your profile",
    "career.profile.resume_links.linkedin_refresh_label":
      "Refresh LinkedIn Info",
    "career.profile.resume_links.linkedin_refresh_tooltip":
      "Fetch updated LinkedIn information.",
    "career.profile.settings.no_saved_changes": "No saved changes yet.",
    "career.recommend_job_postings.chat_preamble":
      "Great! Based on our conversation and your feedback so far, I'll start looking for new positions.",
    "career.referral.footer.invite_friends": "Invite friends",
    "career.referral.intro_test.greeting":
      "Hi {candidateName}, I wanted to introduce you to Harper.",
    "career.referral.intro_test.reward_disclosure":
      "If I introduce you through the Harper referral program, I may receive a reward if you agree and later get hired through Harper.",
    "career.referral.intro_test.service_description":
      "Harper works on the candidate's side to review career opportunities and help with company introductions.",
    "career.referral.intro_test.subject": "Intro: {candidateEmail} <> Harper",
    "career.referral.intro_test.team_note":
      "Harper team, please confirm {candidateName}'s consent directly.",
    "career.referral.menu.invite": "Refer and earn",
    "career.referral.modal.aria_label": "Invite to Harper",
    "career.referral.modal.average_reward": "$3,000 on average",
    "career.referral.modal.copied": "Copied",
    "career.referral.modal.copy": "Copy",
    "career.referral.modal.copy_invite_message": "Copy message",
    "career.referral.modal.description":
      "If someone signs up through your link and gets hired through Harper, you can earn a reward.",
    "career.referral.modal.error_referral_list_load_failed":
      "Failed to load referrals.",
    "career.referral.modal.error_reward_list_load_failed":
      "Failed to load hiring and reward status.",
    "career.referral.modal.error_summary_load_failed":
      "Failed to load your invite information.",
    "career.referral.modal.example_basis":
      "Based on one hire with a $100,000 annual salary",
    "career.referral.modal.example_review_note":
      "An example to illustrate the reward",
    "career.referral.modal.example_reward": "$2,000–$4,000",
    "career.referral.modal.example_reward_heading": "Example reward",
    "career.referral.modal.example_salary": "$100,000",
    "career.referral.modal.first_year_salary_label": "First-year salary",
    "career.referral.modal.hiring_confirmed": "Confirmed",
    "career.referral.modal.hiring_not_confirmed": "Not confirmed",
    "career.referral.modal.hiring_reward_empty":
      "No hiring and reward status yet.",
    "career.referral.modal.hiring_reward_heading": "Hiring & Reward Status",
    "career.referral.modal.hiring_reward_summary":
      "Details for hires confirmed and pending reward processing",
    "career.referral.modal.how_it_works": "How it works",
    "career.referral.modal.invite_message":
      "Hi, I thought Harper might be useful as you explore your next career move.\n\nHarper learns about your experience and what you want next through conversation, then finds companies and roles that may fit. You can start a conversation even if you are not actively job hunting.\n\nTake a look here if you are curious:\n{link}",
    "career.referral.modal.invite_message_description":
      "Your invite link is added automatically. Copy the message as is or tailor it to the person you are sending it to.",
    "career.referral.modal.invite_message_heading":
      "Message to send with your link",
    "career.referral.modal.invite_message_link_placeholder": "[invite link]",
    "career.referral.modal.latest_hire_reward":
      "Referral reward for Harper's most recent hire: $10,000 (assuming they signed up through an invite)",
    "career.referral.modal.link_loading": "Preparing your invite link.",
    "career.referral.modal.read_terms": "Read full terms",
    "career.referral.modal.referral_headline_empty": "No headline yet",
    "career.referral.modal.referral_hired": "Hired",
    "career.referral.modal.referral_name_empty": "Candidate",
    "career.referral.modal.referral_not_hired": "Signed up",
    "career.referral.modal.referrals_heading": "Referrals",
    "career.referral.modal.referrals_load_more": "Load more",
    "career.referral.modal.referrals_summary":
      "{count} candidates have signed up so far.",
    "career.referral.modal.referrals_summary_singular":
      "1 candidate has signed up so far.",
    "career.referral.modal.referrals_table_candidate": "Name",
    "career.referral.modal.referrals_table_headline": "Profile",
    "career.referral.modal.referrals_table_joined_at": "Joined",
    "career.referral.modal.referrals_table_status": "Status",
    "career.referral.modal.retry": "Try again",
    "career.referral.modal.reward_description":
      "If your referral is hired through Harper, we review the reward based on first-year salary, contract terms, and 20% of the hiring fee Harper actually receives.",
    "career.referral.modal.reward_fee_basis":
      "Rewards are based on the hiring fee the company pays Harper and may vary by salary and contract terms.",
    "career.referral.modal.reward_fee_rate": "(20% of the fee)",
    "career.referral.modal.reward_heading": "Referral reward",
    "career.referral.modal.reward_headline":
      "Earn up to $10,000 each time someone you refer lands a new role.",
    "career.referral.modal.reward_not_paid": "Pending",
    "career.referral.modal.reward_note":
      "The actual reward may vary depending on referral eligibility, hiring, and settlement conditions under the terms.",
    "career.referral.modal.reward_paid": "Paid",
    "career.referral.modal.reward_range": "$2,500–$10,000",
    "career.referral.modal.reward_table_amount": "Amount",
    "career.referral.modal.reward_table_candidate": "Candidate",
    "career.referral.modal.reward_table_due_at": "Due Date",
    "career.referral.modal.reward_table_hired": "Hired",
    "career.referral.modal.reward_table_paid": "Paid",
    "career.referral.modal.reward_unlimited_description":
      "If people you refer make multiple career moves through Harper, each hire is reviewed separately for a reward.",
    "career.referral.modal.reward_unlimited_heading":
      "There's no limit to how many rewards you can earn.",
    "career.referral.modal.share": "Share",
    "career.referral.modal.share_link_description":
      "Copy the link and send it with the message below so they know why Harper might be relevant.",
    "career.referral.modal.share_link_heading": "Share your invite link",
    "career.referral.modal.share_text":
      "Explore career opportunities with Harper.",
    "career.referral.modal.share_title": "Harper invite",
    "career.referral.modal.stats_heading": "Your invite activity",
    "career.referral.modal.stats_hires": "Hires",
    "career.referral.modal.stats_note":
      "Visit counts may change after deduplication. The referral list shows only a member's basic profile and whether they were hired, not companies or detailed hiring progress.",
    "career.referral.modal.stats_paid": "Paid",
    "career.referral.modal.stats_signups": "Signups",
    "career.referral.modal.stats_visits": "Link visits",
    "career.referral.modal.step1_description":
      "Send your invite link and the message below to a friend or colleague who may find Harper useful.",
    "career.referral.modal.step1_title":
      "Send your link to someone you want to refer.",
    "career.referral.modal.step2_description":
      "The referral link they use when signing up determines who receives referral credit.",
    "career.referral.modal.step2_title": "They sign up through your link.",
    "career.referral.modal.step3_description":
      "Once the hire through Harper and client settlement are confirmed, we pay the reward under the terms.",
    "career.referral.modal.step3_title":
      "If they are hired, you may earn a reward.",
    "career.referral.modal.title":
      "Introduce Harper to someone in your network",
    "career.referral.modal.toast_invite_message_copied":
      "Invite message copied.",
    "career.referral.modal.toast_invite_message_copy_failed":
      "Failed to copy invite message.",
    "career.referral.modal.toast_link_copied": "Invite link copied.",
    "career.referral.modal.toast_link_copy_failed": "Failed to copy link.",
    "career.referral.modal.top_open_roles": "Top open roles",
    "career.referral.modal.top_open_roles_more": "and more",
    "career.referral.modal.updating": "Updating",
    "career.referral.modal.your_cut_label": "Calculation basis",
    "career.referral.modal.your_cut_value": "20% of the fee paid to Harper",
    "career.referral.modal.your_reward_label": "Your reward",
    "career.referral.network.toast_email_invalid":
      "Please enter a valid email.",
    "career.referral.network.toast_email_required": "Please enter an email.",
    "career.referral.network.toast_link_copy_failed": "Failed to copy link.",
    "career.referral.network.toast_share_link_copied": "Share link copied.",
    "career.referral.network.toast_share_link_create_failed":
      "Failed to create share link.",
    "career.referral.network.toast_visit_capture_failed":
      "Failed to record share visit.",
    "career.referral.network_share_modal.close": "Close",
    "career.referral.network_share_modal.close_aria": "Close share modal",
    "career.referral.network_share_modal.create_link": "Create share link",
    "career.referral.network_share_modal.creating": "Creating...",
    "career.referral.network_share_modal.email_label": "Email",
    "career.referral.network_share_modal.title": "Create share link",
    "career.resume_dropzone.drag_description":
      "Drop your file to select your resume.",
    "career.resume_dropzone.drag_title": "Drop your file here to upload",
    "career.resume_dropzone.empty_title":
      "Drag and drop your resume or select a file",
    "career.resume_dropzone.selected_description":
      "Click or drop again to replace with a different file.",
    "career.resume_dropzone.settings_description":
      "You can upload PDF, DOCX, TXT, and MD files.",
    "career.resume_dropzone.settings_selected_description":
      "Press Save to update with this file.",
    "career.resume_dropzone.unsupported_file":
      "Please upload a supported resume file type.",
    "career.settings.career_resume_links_settings_section.114mcb5":
      "Delete link",
    "career.settings.career_settings_modal.0858bd9":
      "If you leave, your account, career profile, resume, and chat/recommendation data will be deleted. This can't be undone.",
    "career.settings.career_settings_modal.0j4pj4h":
      "Do you want to delete your account?",
    "career.settings.career_settings_modal.0jiry9t": "Cancel",
    "career.settings.career_settings_modal.0poe6eq": "Back",
    "career.settings.career_settings_modal.0tdjt8e": "Profile Settings",
    "career.settings.career_settings_modal.0tel9h5": "Delete Account",
    "career.settings.career_settings_modal.0zjg8a0": "Logging in",
    "career.settings.career_settings_modal.11hatjy": "Career Settings",
    "career.settings.career_settings_modal.11q4o0j":
      "Close withdrawal confirmation",
    "career.settings.career_settings_modal.1338q8i": "Settings",
    "career.settings.career_settings_modal.16x7oad": "Close Settings",
    "career.settings.career_settings_modal.18qhozv":
      "Drag down to shrink the menu, drag up to expand full screen.",
    "career.settings.career_settings_modal.1b7saeu":
      "There was a problem processing your account deletion. Please try again shortly.",
    "career.settings.career_settings_modal.1ba4567": "Delete Account",
    "career.settings.career_settings_modal.1hdokry":
      "Deleted data cannot be recovered.",
    "career.settings.career_settings_modal.1lbfn2i": "Account Settings",
    "career.settings.career_settings_modal.1stwtug":
      "If you withdraw, your account access, career profile, resume, chat history, and recommendation/settings data will be deleted. This action can't be undone.",
    "career.settings.career_settings_modal.1u81q4e": "My Resume/Link",
    "career.settings.career_settings_modal.1vcdzyt":
      "Manage account sessions and sign-up status.",
    "career.settings.career_settings_modal.1vqjolg": "Processing withdrawal",
    "career.settings.career_settings_modal.account_email": "Email",
    "career.settings.career_settings_modal.account_email_invalid":
      "Please enter a valid email.",
    "career.settings.career_settings_modal.account_name": "Name",
    "career.settings.career_settings_modal.account_name_required":
      "Please enter your name.",
    "career.settings.career_settings_modal.account_save": "Save",
    "career.settings.career_settings_modal.account_save_failed":
      "Failed to save account information.",
    "career.settings.career_settings_modal.account_saved":
      "Account information saved.",
    "career.settings.career_settings_modal.account_saving": "Saving",
    "career.settings.career_settings_modal.delete_reason_detail_label":
      "Tell us more",
    "career.settings.career_settings_modal.delete_reason_detail_placeholder":
      "Share anything that could help Harper improve.",
    "career.settings.career_settings_modal.delete_reason_difficult_to_use":
      "The service was difficult or inconvenient to use",
    "career.settings.career_settings_modal.delete_reason_infrequent_use":
      "I don't use the service often",
    "career.settings.career_settings_modal.delete_reason_label":
      "We'd appreciate it if you shared why you're leaving.",
    "career.settings.career_settings_modal.delete_reason_missing_opportunities":
      "I couldn't find the opportunities or recommendations I wanted",
    "career.settings.career_settings_modal.delete_reason_new_account":
      "I plan to sign up again with another account",
    "career.settings.career_settings_modal.delete_reason_other": "Other",
    "career.settings.career_settings_modal.delete_reason_placeholder":
      "(Optional) Select a reason",
    "career.settings.career_settings_modal.delete_reason_privacy_concern":
      "I have privacy concerns",
    "career.settings.career_settings_modal.delete_reason_recommendation_quality":
      "The recommendation quality didn't meet my expectations",
    "career.settings.career_settings_modal.keep_account": "Keep Account",
    "career.settings.email_change.availability_check_failed":
      "We couldn't check whether this email is available.",
    "career.settings.email_change.callback_failed":
      "We couldn't save the verified email. Please try again.",
    "career.settings.email_change.check_complete": "Check verification",
    "career.settings.email_change.check_failed":
      "We couldn't check the email verification status.",
    "career.settings.email_change.current_email": "Current email",
    "career.settings.email_change.completed":
      "Your verified email has been updated.",
    "career.settings.email_change.description":
      "Enter the email you'd like to use, and we'll send you a verification email. Your email will be updated once it's verified.",
    "career.settings.email_change.invalid":
      "Please enter a valid email address.",
    "career.settings.email_change.in_use":
      "We can't proceed with this email. It may be blocked from verification or already registered.",
    "career.settings.email_change.link_expired":
      "This link expired or was replaced by a resend. Open the most recent verification email.",
    "career.settings.email_change.new_email": "New email",
    "career.settings.email_change.pending_description":
      "Open the verification link sent to your new email, then check the status below.",
    "career.settings.email_change.pending_email": "Email awaiting verification",
    "career.settings.email_change.resend": "Resend verification email",
    "career.settings.email_change.resend_completed":
      "Verification email resent",
    "career.settings.email_change.resend_failed":
      "We couldn't resend the verification email.",
    "career.settings.email_change.resend_request_missing":
      "We couldn't find a pending email change request. Please enter the new email again.",
    "career.settings.email_change.request_code": "Latest email request code",
    "career.settings.email_change.resent":
      "A new verification email was sent to your new address. The previous link is now invalid, so open only the newest email.",
    "career.settings.email_change.same_email":
      "This is already your current email.",
    "career.settings.email_change.save_failed":
      "We couldn't save the verified email.",
    "career.settings.email_change.send": "Send verification email",
    "career.settings.email_change.send_failed":
      "We couldn't send the verification email.",
    "career.settings.email_change.sent":
      "We sent a verification email to your new address. Resending invalidates earlier links, so open only the newest email.",
    "career.settings.email_change.still_pending":
      "Open the verification link sent to your new email.",
    "career.settings.email_change.title": "Change email",
    "career.settings.email_change.use_another": "Use another email",
    "career.tool_policy.acknowledgement_example":
      "Got it. I'll use that condition when looking for fitting opportunities.",
    "ui.1787f9e": "Korean",
  },
} as const;
