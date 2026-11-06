/**
 * Company-side names, in one place.
 *
 * Screens, server texts (feed, mail, Slack) and the company Harper prompt read
 * these, so a company sees one name for one thing wherever it shows up, and
 * Harper says the name the screen shows. Stored values (stage, status, tags,
 * decision values, tool names) never change here; only what they are called.
 *
 * Renaming: change `ko`/`en` and move the previous name into `former` on the
 * same line. Harper's name table (companyTermsPrompt) is built from here, so
 * Harper still reads older messages, summaries and memory that use the
 * previous name, and terms.test.ts fails while a former name is still written
 * in company-side code or docs.
 *
 * Only names live here. Sentences that contain a name are written out where
 * they are used (Korean particles depend on the name); the same test keeps
 * them current.
 *
 * Source: company UX writing handoff v1.1 (11/4), glossary 1-1, status table
 * 1-3 and replacement table 1-4.
 */
export type CompanyTermLocale = "ko" | "en";

export type CompanyTerm = {
  readonly ko: string;
  readonly en: string;
  /** Names this one replaced. */
  readonly former: readonly string[];
  /** Replaced only in Korean copy; English keeps them ("Intro", "Role"). */
  readonly formerKo: readonly string[];
};

const term = (
  ko: string,
  en: string,
  former: readonly string[] = [],
  formerKo: readonly string[] = []
): CompanyTerm => ({ ko, en, former, formerKo });

export function companyTerm(value: CompanyTerm, locale: CompanyTermLocale) {
  return locale === "en" ? value.en : value.ko;
}

/** For screens: `ct(c, COMPANY_TERMS.action.connect)`. */
export function ct(c: (ko: string, en: string) => string, value: CompanyTerm) {
  return c(value.ko, value.en);
}

const WAITING = term("연결을 기다리는 후보", "Waiting to connect", [
  "연결 수락한 후보",
  "연결 수락할 후보",
  "관심 있는 후보",
  "Ready to connect",
  "ready to connect",
]);
const TO_REQUEST = term("연결을 요청할 후보", "Ready to reach out", [
  "연결 제안할 후보",
  "먼저 제안 가능한 후보",
  "Suggested candidates",
  "suggested candidates",
]);
const CRITERIA = term("확인할 기준", "What to check", [
  "매칭 기준",
  "평가 기준",
  "Evaluation Criteria",
  "Evaluation criteria",
]);

export const COMPANY_TERMS = {
  /** The sidebar, its user menu and the company settings menu. */
  nav: {
    home: term("홈", "Home", [], ["Home"]),
    roles: term("역할", "Roles", [], ["Roles"]),
    newRole: term("새 역할", "New role", [], ["New role"]),
    recent: term("최근", "Recent", [], ["Recent"]),
    /** The sidebar item only: "Organization" also names the company account itself. */
    settings: term("회사 설정", "Company settings"),
    company: term("회사 정보", "Company", [], ["Company"]),
    members: term("팀원", "Members", [], ["Members"]),
    integrations: term("연동", "Integrations", [], ["Integrations"]),
    templates: term("템플릿", "Templates", [], ["Templates"]),
    billing: term("결제", "Billing", [], ["Billing"]),
    slots: term("슬롯", "Slots", [], ["Slots"]),
    help: term("도움말", "Help"),
    calendar: term("일정 연동", "Calendar"),
  },

  /** Tabs on Home and on a role. */
  tab: {
    inbox: term("인박스", "Inbox"),
    activity: term("소식", "Activity"),
    chat: term("채팅", "Chat"),
    pipeline: term("파이프라인", "Pipeline"),
    roleInfo: term("역할 정보", "Role"),
    settings: term("설정", "Settings"),
  },

  role: term("역할", "Role", [], ["Role"]),
  candidate: term("후보", "Candidate"),
  /** Harper emails both sides. Also the usage unit: 기본 연결, 남은 연결 N회. */
  connection: term("연결", "Intro", ["크레딧", "Credit"], ["Intro"]),

  /** Pipeline stages by stored value. Custom company stages keep their own names. */
  stage: {
    company_intro: TO_REQUEST,
    pending_connection: WAITING,
    intro_requested: term("연결 요청함", "Intro requested", [
      "연결 제안한 후보",
      "Intro Requested",
    ]),
    connected: term("연결됨", "Connected"),
    final_offer: term("오퍼", "Offer", ["최종 오퍼", "Final offer"]),
    process_stopped: term("진행 종료", "Closed", [
      "프로세스 중단",
      "프로세스 종료",
      "Process ended",
    ]),
    archived: term("보관", "Archived", ["아카이브"]),
    /** Never a column on company screens; only the "Harper가 확인 중 N명" line. */
    accepted: term("Harper가 확인 중", "Harper is reviewing", [
      "Harper 내부 · 수락",
      "내부 수락",
    ]),
  },

  inbox: {
    external: term("외부 후보", "External"),
    saved: term("저장", "Saved", ["저장함"]),
  },

  action: {
    /** Harper asks the candidate first; uses an intro when the request is sent. */
    request: term("연결 요청", "Request intro", ["Send Intro"]),
    /** Emails both sides right away; uses an intro. */
    connect: term("연결하기", "Connect", ["Accept Intro"]),
    pass: term("이번엔 넘길게요", "Pass for now", ["Pass", "Reject"]),
    save: term("저장", "Save"),
    moveRole: term("다른 역할로 옮기기", "Move to another role", ["다른 Role로 이동"]),
  },

  criteria: {
    section: CRITERIA,
    strong: term("아주 잘 맞음", "Strong", ["매우 잘 맞음", "Excellent fit"]),
    good: term("잘 맞음", "Good", ["Good fit"]),
    check: term("확인 필요", "Needs a check", ["More information needed"]),
  },

  detail: {
    summary: term("한 줄 요약", "Summary", ["TL;DR", "Harper의 추천 이유"]),
    harperNote: term("Harper 메모", "Harper's note", ["Harper Note"]),
  },

  brief: {
    /** company_internal_roles.request: Harper searches with it; candidates never see it. */
    whoWeAreLookingFor: term("찾는 사람", "Who we're looking for", [
      "Hiring Brief",
      "Brief",
    ]),
    /** company_internal_roles.criteria. */
    criteria: CRITERIA,
    /** The posting text candidates see. */
    roleDescription: term("역할 설명", "Role description", [], ["Description"]),
    reviewButton: term("기준 확인하기", "Review criteria", ["Brief 확인하기"]),
  },

  /** The steps on top of a new role's start screens, in order; the last is also its button. */
  roleStart: {
    setup: term("역할 정보", "Role", ["Setup"]),
    brief: term("찾는 사람", "Who", ["Brief"]),
    align: term("기준 맞추기", "Calibrate", ["Align"]),
    finalize: term("시작하기", "Start", ["Finalize"]),
  },

  roleStatus: {
    draft: term("작성 중", "Draft"),
    active: term("진행 중", "Active"),
    paused: term("잠시 멈춤", "Paused", ["채용 일시정지"]),
    ended: term("종료", "Closed"),
  },

  roleStatusAction: {
    pause: term("잠시 멈추기", "Pause"),
    resume: term("다시 진행하기", "Resume", ["채용 진행하기"]),
    close: term("종료하기", "Close", ["채용 종료하기"]),
  },

  scheduledSearch: term("정기 탐색", "Scheduled search", [
    "정기 추천",
    "추천 후보 검색",
    "정기 후보 검색",
  ]),

  todo: {
    button: term("할 일", "To-do"),
    decide: term("결정할 것", "To decide"),
    updates: term("알림", "Updates"),
    harperCan: term("Harper가 할 수 있는 일", "Harper can help", ["하퍼의 제안"]),
    inProgress: term("Harper가 하는 중", "In progress"),
  },

  usage: {
    included: term("기본 연결", "Included intros", ["공용 Intro", "Shared Intros", "shared Intros"]),
    history: term("연결 사용 내역", "Intro history", ["Intro 사용 내역"]),
  },

  access: {
    roleAccess: term("볼 수 있는 역할", "Role access", ["접근 범위"]),
    allRoles: term("모든 역할", "All roles", ["전체 Role"]),
    myRoles: term("내가 맡은 역할", "My roles", ["담당 Role"]),
    owner: term("소유자", "Owner", [], ["Owner"]),
    admin: term("관리자", "Admin", [], ["Admin"]),
    viewer: term("조회자", "Viewer", [], ["Viewer"]),
  },
} as const;

export type CompanyStageId = keyof typeof COMPANY_TERMS.stage;

export function companyStageTerm(stage: string): CompanyTerm | null {
  return Object.prototype.hasOwnProperty.call(COMPANY_TERMS.stage, stage)
    ? COMPANY_TERMS.stage[stage as CompanyStageId]
    : null;
}

/** The stage name, or null for custom company stages (their names are the company's). */
export function companyStageName(stage: string, locale: CompanyTermLocale) {
  const value = companyStageTerm(stage);
  return value ? companyTerm(value, locale) : null;
}

/** Korean "(으)로" after a name: 으로 after a final consonant other than ㄹ. */
export function withKoreanRo(word: string) {
  const text = word.trim();
  const last = text.charCodeAt(text.length - 1);
  if (!(last >= 0xac00 && last <= 0xd7a3)) return `${text}(으)로`;
  const final = (last - 0xac00) % 28;
  return final === 0 || final === 8 ? `${text}로` : `${text}으로`;
}

function collectTerms(value: unknown, into: CompanyTerm[]): CompanyTerm[] {
  if (!value || typeof value !== "object") return into;
  if ("former" in value) {
    if (!into.includes(value as CompanyTerm)) into.push(value as CompanyTerm);
    return into;
  }
  for (const child of Object.values(value)) collectTerms(child, into);
  return into;
}

/** Every distinct term, in declaration order. */
export const ALL_COMPANY_TERMS: readonly CompanyTerm[] = collectTerms(COMPANY_TERMS, []);

/**
 * Harper's name table: stored stage values, the names on screen and the names
 * they replaced. Built from COMPANY_TERMS, so a rename needs no prompt edit.
 */
export function companyTermsPrompt(locale: CompanyTermLocale | "both") {
  const name = (value: CompanyTerm) =>
    locale === "both" ? `${value.ko} / ${value.en}` : companyTerm(value, locale);
  // Korean-only former names ("Intro", "Role") are the English names, which "both" already shows.
  // Case variants ("Ready to connect", "ready to connect") are one former name for Harper.
  const formers = (value: CompanyTerm) =>
    (locale === "ko" ? [...value.formerKo, ...value.former] : [...value.former]).filter(
      (former, index, all) =>
        all.findIndex((other) => other.toLowerCase() === former.toLowerCase()) === index
    );
  const formerly = locale === "en" ? "formerly" : "예전";
  const withFormers = (head: string, old: readonly string[]) =>
    old.length ? `- ${head} (${formerly} ${old.join(", ")})` : `- ${head}`;

  // Menus and the new role steps read as one line each, every name with what it replaced.
  const groups = [
    { label: { ko: "메뉴", en: "Menus", both: "메뉴 / Menus" }[locale], terms: Object.values(COMPANY_TERMS.nav) },
    {
      label: { ko: "새 역할 단계", en: "New role steps", both: "새 역할 단계 / New role steps" }[locale],
      terms: Object.values(COMPANY_TERMS.roleStart),
    },
  ];
  const groupLine = (label: string, terms: readonly CompanyTerm[]) =>
    `- ${label}: ${terms
      .map((value) =>
        formers(value).length ? `${name(value)}(${formerly} ${formers(value).join("/")})` : name(value)
      )
      .join(" · ")}`;
  const listed = new Set<CompanyTerm>([
    ...Object.values(COMPANY_TERMS.stage),
    ...groups.flatMap((group) => group.terms),
  ]);
  // One line per name, so two terms with the same name never read as two things.
  const byName = new Map<string, string[]>();
  for (const value of ALL_COMPANY_TERMS) {
    if (listed.has(value)) continue;
    const old = byName.get(name(value)) ?? [];
    byName.set(name(value), [...new Set([...old, ...formers(value)])]);
  }
  const entries = [...byName];

  return [
    locale === "en"
      ? "Company-side names, exactly as the product shows them. Older messages, summaries and memory may use a former name: read it as the current name and use only the current name yourself. Explain a rename only when asked. Stage values on the left are data, not words for the user."
      : "회사 쪽 이름은 화면과 똑같이 쓴다. 지난 대화·요약·메모리의 예전 이름은 같은 것으로 읽고, 답할 때는 지금 이름만 쓴다. 이름이 바뀐 경위는 사용자가 물을 때만 설명한다. 왼쪽의 단계 값은 데이터 값이라 답에 쓰지 않는다.",
    ...Object.entries(COMPANY_TERMS.stage).map(([code, value]) =>
      withFormers(`${code} = ${name(value)}`, formers(value))
    ),
    ...groups.map((group) => groupLine(group.label, group.terms)),
    ...entries.filter(([, old]) => old.length).map(([head, old]) => withFormers(head, old)),
    `- ${entries.filter(([, old]) => !old.length).map(([head]) => head).join(" · ")}`,
  ].join("\n");
}
