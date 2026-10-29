import type { RoleStartResponse } from "@/components/org/role-start/RoleStartOnboarding";
import type {
  OrgBoardItem,
  OrgBootstrapResponse,
  OrgRole,
  OrgStage,
  OrgTalentDetailResponse,
} from "@/lib/org/server";
import type { RoleStartCandidateView } from "@/lib/org/roleStart/view";

// Synthetic browser-only fixtures. Never insert these into a database.
export const WORKSPACE_ID = "00000000-0000-4000-8000-000000009100";
export const ROLE_ID = "00000000-0000-4000-8000-000000009101";
export const USER_ID = "00000000-0000-4000-8000-000000009102";
export const FIXTURE_TIME = "2026-10-24T00:00:00.000Z";
export const PREVIEW_STEPS = [
  ["preparing", "작성 중"],
  ["setup", "Setup"],
  ["compensation", "연봉 질문"],
  ["questions", "추가 질문"],
  ["brief", "Brief"],
  ["align", "후보 평가"],
  ["finalize", "알림·시작"],
  ["inbox", "시작 후 인박스"],
  ["pipeline", "연결·파이프라인"],
  ["email", "소개 이메일"],
] as const;
export type PreviewStep = (typeof PREVIEW_STEPS)[number][0];
// Same built-in stages returned by server.ts buildBoardStages, without custom stages.
export const PREVIEW_STAGES: OrgStage[] = [
  { id: "company_intro", label: "먼저 제안 가능한 후보", sortOrder: -0.5 },
  { id: "intro_requested", label: "Intro Requested", sortOrder: -0.25 },
  { id: "pending_connection", label: "연결 대기", sortOrder: 0 },
  { id: "connected", label: "연결됨", sortOrder: 1 },
  { id: "final_offer", label: "최종 오퍼", sortOrder: 10000 },
  { id: "process_stopped", label: "프로세스 중단", sortOrder: 10001 },
];

export function createFixtures() {
  const role: OrgRole & {
    information: { testOnly: true; testFixture: string };
  } = {
    roleId: ROLE_ID,
    workspaceId: WORKSPACE_ID,
    name: "프로덕트 디자이너",
    status: "draft",
    description:
      "## 스튜디오 예시\n팀의 업무를 함께 정리하는 B2B SaaS를 만들어요.\n\n## 맡게 될 일\n사용자 인터뷰부터 화면 설계, 프로토타입, 출시 후 개선까지 함께해요.\n\n## 찾는 경험\n디지털 제품의 사용자 문제를 정의하고 출시까지 참여한 경험을 보고 있어요.\nB2B SaaS 경험은 우대하며 필수는 아니에요.",
    request:
      "사용자 문제를 정의하고 제품 출시까지 참여한 디자이너를 찾아요. B2B SaaS 경험은 우대이며 필수는 아니에요.",
    criteria: [
      {
        id: "cr_problem",
        name: "사용자 문제 정의",
        criteria: "사용자 조사에서 문제를 구체화한 경험을 확인해요.",
        requirement: "must",
        importance: 3,
      },
      {
        id: "cr_launch",
        name: "제품 출시 경험",
        criteria: "설계한 제품을 출시하고 개선한 경험을 확인해요.",
        requirement: "must",
        importance: 3,
      },
      {
        id: "cr_b2b",
        name: "B2B SaaS 경험",
        criteria:
          "기업용 제품의 복잡한 업무 흐름을 설계한 경험은 우대해요. 없어도 제외하지 않아요.",
        requirement: "preferred",
        importance: 1,
      },
    ],
    locationText: "서울",
    workMode: "hybrid",
    employmentTypes: ["full_time"],
    salaryRange: null,
    externalJdUrl: null,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    introSearchDate: ["Mon", "Wed", "Fri"],
    introSearchTime: 10,
    isCompanyFirstSearch: true,
    information: { testOnly: true, testFixture: "role-start-browser-preview" },
  };
  const workspace = {
    workspaceId: WORKSPACE_ID,
    companyName: "스튜디오 예시",
    companyDescription: "팀을 위한 B2B SaaS",
    logoUrl: null,
    pitch: "팀의 업무를 함께 정리하는 제품을 만들어요.",
    request: null,
    updatedAt: FIXTURE_TIME,
  };
  const member = {
    userId: USER_ID,
    name: "김지수",
    email: "jisoo@example.invalid",
    authority: "owner" as const,
    accessScope: "organization" as const,
    joinedAt: FIXTURE_TIME,
    profilePicture: null,
    role: "채용 담당",
  };
  const bootstrap: OrgBootstrapResponse = {
    ok: true,
    workspace,
    workspaces: [workspace],
    currentUser: member,
    members: [member],
    roles: [role],
    invitations: [],
    teams: [],
  };
  const people = [
    {
      name: "김서연",
      company: "예시워크",
      years: 6,
      headline: "사용자 조사부터 B2B 제품 출시까지 함께한 프로덕트 디자이너",
      tldr: "고객 인터뷰로 문제를 정의하고 협업 도구를 출시했어요. 복잡한 업무 흐름을 단순하게 만드는 경험이 있어요.",
      fit: "excellent" as const,
    },
    {
      name: "이준호",
      company: "샘플스튜디오",
      years: 4,
      headline: "모바일 서비스의 가입·결제 경험을 설계한 디자이너",
      tldr: "사용자 인터뷰와 제품 출시 경험이 있어요. B2B SaaS 경험은 프로필에서 확인되지 않아요.",
      fit: "good" as const,
    },
    {
      name: "박수민",
      company: "데모클라우드",
      years: 7,
      headline: "기업용 대시보드와 디자인 시스템을 만든 프로덕트 디자이너",
      tldr: "기업용 제품의 정보 구조와 디자인 시스템을 담당했어요. 직접 사용자 조사를 진행한 범위는 확인이 필요해요.",
      fit: "uncertain" as const,
    },
  ];
  const candidates: RoleStartCandidateView[] = people.map((person, i) => ({
    talentId: `00000000-0000-4000-8000-00000000920${i}`,
    name: person.name,
    headline: person.headline,
    location: "서울",
    current: person.company,
    years: person.years,
    yearsBasis: "role",
    failed: false,
    verdict: {
      tldr: person.tldr,
      finalFit: person.fit,
      companyQuestion: null,
      criteria: role.criteria.map((criterion, j) => ({
        criterionId: criterion.id!,
        name: criterion.name,
        fitness:
          (i === 1 && j === 2) || (i === 2 && j === 0)
            ? "uncertain"
            : person.fit === "excellent"
              ? "excellent"
              : "good",
        evidence: [
          "고객 인터뷰 결과를 제품 과제로 구체화했어요.",
          "팀과 함께 제품을 출시하고 사용성을 개선했어요.",
          i === 1
            ? "B2B SaaS 경험은 프로필에 기재되어 있지 않아요."
            : "기업용 협업 도구의 업무 흐름을 설계했어요.",
        ][j],
      })),
      reasonChips: [
        {
          id: "missing",
          label: "경험을 더 확인하고 싶어요",
          appliesTo: ["uncertain", "bad"],
        },
      ],
    },
  }));
  const response: RoleStartResponse = {
    issues: [],
    role: {
      status: role.status!,
      hasDescription: true,
      description: role.description,
      name: role.name,
      locationText: role.locationText,
      workMode: role.workMode,
      employmentTypes: role.employmentTypes,
      salaryRange: role.salaryRange ?? null,
    },
    session: {
      roleId: ROLE_ID,
      revision: 1,
      phase: "questions",
      briefHash: "preview-brief",
      stalled: false,
      readsStalled: false,
      refining: false,
      brief: {
        summary: role.request!,
        hardConditions: [],
        criteria: role.criteria.map((criterion) => ({
          id: criterion.id,
          name: criterion.name,
          criteria: criterion.criteria,
          requirement: criterion.requirement,
          importance: criterion.importance,
          changeReason: undefined,
          changedAt: undefined,
          reference: null,
        })),
        references: [],
      },
      questions: { history: [] },
      pendingQuestion: {
        id: "q_preview",
        question: "새로 합류할 분에게 가장 먼저 맡기고 싶은 일은 무엇인가요?",
        why: "같은 디자이너 역할 안에서도 먼저 풀 문제가 달라질 수 있어요.",
        status: "pending",
        answer: null,
        chips: [
          { id: "discovery", label: "사용자 문제 찾기" },
          { id: "workflow", label: "기존 제품 사용성 개선" },
          { id: "new", label: "새 기능 설계·출시" },
          { id: "open", label: "아직 정하지 않았어요" },
        ],
      },
      firstCandidates: candidates,
      evaluations: {},
      batch: null,
      progress: [],
      briefEdit: null,
      notice: null,
    },
    profiles: Object.fromEntries(
      candidates.map((candidate, i) => [
        candidate.talentId,
        {
          recentCompanies: [
            {
              label: people[i].company,
              detail: "프로덕트 디자이너",
              logoUrl: null,
              period: "2021 – 현재",
            },
          ],
          recentSchools: [],
          experiences: [
            {
              company: people[i].company,
              role: "프로덕트 디자이너",
              start: "2021",
              end: null,
              description: people[i].tldr,
            },
          ],
        },
      ])
    ),
  };
  const items: OrgBoardItem[] = candidates.map((candidate, i) => ({
    capabilities: {
      contactCandidate: true,
      moveStage: true,
      pass: true,
      requestIntro: i !== 0,
      scheduleInterview: true,
      viewResume: false,
    },
    companyIntro: i
      ? {
          id: `intro-preview-${i}`,
          candidateSentAt: null,
          companyAppeal: null,
          nextStageId: null,
          requestedAt: null,
          selectionReason: candidate.verdict!.tldr,
          tldr: candidate.verdict!.tldr,
          status: "ready",
        }
      : null,
    criteriaEvaluations: candidate.verdict!.criteria.map((item) => ({
      name: item.name,
      fitness: item.fitness,
      content: item.evidence,
    })),
    talent: {
      userId: candidate.talentId,
      name: candidate.name,
      headline: candidate.headline,
      location: candidate.location,
      email: null,
      profilePicture: null,
      recentCompanies: response.profiles![candidate.talentId].recentCompanies,
      recentSchools: [],
    },
    talentId: candidate.talentId,
    roleId: ROLE_ID,
    roleName: role.name,
    source: i ? "company_intro" : "recommendation",
    stage: i ? "company_intro" : "pending_connection",
    stageTag: null,
    recommendationId: i
      ? `company_intro:intro-preview-${i}`
      : "recommendation-preview-0",
    recommendationRank: i + 1,
    processClosureNoticeUnresolved: false,
    fitReasons: [],
    fitSummary: candidate.verdict!.tldr,
    createdAt: FIXTURE_TIME,
    recommendedAt: FIXTURE_TIME,
    companyPresentedAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
    upcomingMeeting: null,
  }));
  return { role, workspace, member, bootstrap, response, items };
}
export type PreviewFixtures = ReturnType<typeof createFixtures>;

export function previewDetail(
  fixtures: PreviewFixtures,
  talentId: string
): OrgTalentDetailResponse {
  const item =
    fixtures.items.find((item) => item.talentId === talentId) ??
    fixtures.items[0];
  const experience = fixtures.response.profiles![item.talentId].experiences[0];
  return {
    ...item,
    companyRequestHistory: [],
    connectionConfirmationEmails: [],
    feed: [],
    introEmails: [],
    meetingEvents: [],
    members: [fixtures.member],
    processClosureNotification: null,
    profile: {
      bio: item.fitSummary,
      documents: [],
      educations: [],
      experiences: [
        {
          companyLogo: null,
          companyLocation: "서울",
          companyName: experience.company,
          description: experience.description,
          employmentType: "정규직",
          endDate: null,
          memo: null,
          role: experience.role,
          startDate: "2021-01",
        },
      ],
      extras: [],
      registeredLinks: [],
      location: "서울",
    },
    profileMarkdown: `## 경력\n${experience.company} · ${experience.role}\n\n${experience.description}`,
    recommendation: {
      recommendationId: item.recommendationId,
      recommendedAt: FIXTURE_TIME,
      candidateAcceptedAt:
        item.source === "recommendation" ? FIXTURE_TIME : null,
      opportunityType: "internal",
      fitReason: item.fitSummary,
      stage: item.stage,
    },
    resume: { fileName: null, hasStorageFile: false, links: [] },
    role: fixtures.role,
    talent: { ...item.talent, bio: item.fitSummary },
    workspace: fixtures.workspace,
  };
}
