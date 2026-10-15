import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OrgWorkspaceProvider,
  type OrgWorkspaceContextValue,
} from "@/hooks/org/useOrgWorkspace";
import type { OrgSlackChannel, OrgSlackStatus } from "@/hooks/org/useOrgSlack";
import {
  getOrgPermissions,
  type OrgMembershipRole,
} from "@/lib/org/permissions";
import {
  canProvideOrgCompanyContext,
  getOrgOnboardingSteps,
  type OrgOnboardingStep,
} from "@/lib/org/onboarding";
import type { OrgMember, OrgRole, OrgWorkspace } from "@/lib/org/server";
import { queryKeys } from "@/lib/queryKeys";
import { OrgOnboardingFlow } from "./OrgOnboardingPage";
import { OrgSignupEntry } from "./OrgSignupEntry";
import { OrgOrganizationCreationPage } from "./OrgOrganizationCreationPage";

const flows = [
  { value: "first", label: "기존 Workspace · 첫 팀원" },
  { value: "joining", label: "기존 Workspace · 나중에 합류" },
  { value: "new", label: "Workspace 없음 · 신규 생성" },
  { value: "additional", label: "기존 계정 · Organization 추가" },
] as const;
type PreviewFlow = (typeof flows)[number]["value"];

const screens = [
  { id: "entry", step: null, label: "Workspace 생성" },
  { id: "organization-create", step: null, label: "Organization 추가" },
  { id: "profile", step: "profile", label: "환영" },
  { id: "company-details", step: "company-details", label: "회사 정보 확인" },
  { id: "company", step: "company", label: "회사 소개" },
  { id: "slack", step: "slack", label: "Slack" },
  { id: "slack-channel", step: "slack", label: "채널 연결" },
  { id: "slack-invite", step: "slack", label: "다른 계정 초대" },
  { id: "roles", step: "roles", label: "역할" },
  { id: "plan", step: "plan", label: "요금제" },
  { id: "guide", step: "guide", label: "Harper 활용 안내" },
  { id: "done", step: "done", label: "완료" },
] as const satisfies ReadonlyArray<{
  id: string;
  step: OrgOnboardingStep | null;
  label: string;
}>;

// In-memory UI fixtures only. Never insert these into a database or matching path.
const workspace: OrgWorkspace = {
  workspaceId: "onboarding-preview-workspace",
  companyName: "모먼트랩",
  companyDescription: "작은 팀의 더 나은 결정을 돕는 제품을 만듭니다.",
  logoUrl: null,
  pitch:
    "## 우리가 만드는 것\n작은 팀이 더 좋은 결정을 내리도록 돕는 협업 제품을 만들고 있어요.\n\n## 함께 일하는 방식\n각자의 전문성을 존중하고, 문제를 발견한 사람이 해결 방향을 제안합니다.",
  request: null,
  updatedAt: "2026-09-23T00:00:00Z",
  companyProfile: {
    careerUrl: null,
    companyDbDescription: null,
    companyDbId: null,
    employeeCountStart: 15,
    employeeCountEnd: 25,
    foundedYear: 2023,
    fundingUrl: null,
    homepageUrl: null,
    investors: [],
    lastFundingRoundDescription: "제품의 성장을 함께할 팀을 꾸리고 있어요.",
    lastFundingStage: "Series A",
    linkedinUrl: null,
    location: "서울 성수",
    mainInvestors: null,
    relatedLinks: [],
    shortDescription: null,
    specialities: [],
    totalFundingRaised: "60억 원",
  },
};
const member: OrgMember = {
  userId: "onboarding-preview-user",
  name: "김민서",
  email: "preview@example.test",
  authority: "owner",
  role: "채용 매니저",
  joinedAt: "2026-09-23T00:00:00Z",
  profilePicture: null,
  onboardingCompletedAt: null,
};
const channel: OrgSlackChannel = {
  channelId: "C_PREVIEW",
  channelName: "harper-hiring",
  isEnabled: true,
  isPrivate: false,
  defaultRoleId: null,
  replyToHarperThreads: true,
  respondToMentions: true,
};
const availableChannels: OrgSlackChannel[] = [
  "harper-hiring",
  "recruiting",
  "people-team",
  "team-leads",
  "engineering",
  "design",
  "product",
  "operations",
  "interview-feedback",
  "hiring-backend-engineering-and-platform",
  "talent-community",
  "general",
].map((channelName, index) => ({
  ...channel,
  channelId: index === 0 ? channel.channelId : `C_PREVIEW_${index}`,
  channelName,
  isEnabled: false,
  isPrivate:
    channelName === "team-leads" || channelName === "interview-feedback",
}));

function previewRoles(status: string): OrgRole[] {
  return status === "none"
    ? []
    : [
        {
          roleId: "onboarding-preview-role",
          workspaceId: workspace.workspaceId,
          name: "Backend Engineer",
          status,
          description:
            "제품의 핵심 서비스를 설계하고, 동료들과 함께 더 나은 사용자 경험을 만들어갈 분을 찾고 있어요.",
          request: null,
          criteria: [],
          employmentTypes: ["정규직"],
          workMode: "하이브리드",
          locationText: "서울 성수",
          createdAt: workspace.updatedAt,
          updatedAt: workspace.updatedAt,
          externalJdUrl: null,
        },
      ];
}

function previewSetup(
  flow: PreviewFlow,
  authority: OrgMembershipRole,
  profileReady: boolean,
  status: string
) {
  const currentMember: OrgMember = {
    ...member,
    authority: flow === "new" || flow === "additional" ? "owner" : authority,
    name: profileReady ? member.name : "",
    role: profileReady ? member.role : "",
  };
  const members =
    flow === "joining"
      ? [
          {
            ...member,
            userId: "onboarding-preview-first-user",
            name: "박지원",
            joinedAt: "2026-09-22T00:00:00Z",
            onboardingCompletedAt: "2026-09-22T01:00:00Z",
          },
          currentMember,
        ]
      : [currentMember];
  const previewWorkspace: OrgWorkspace = {
    ...workspace,
    signupState:
      flow === "new" || flow === "additional"
        ? {
            createdBy: currentMember.userId,
            ...(flow === "additional"
              ? { source: "organization_add" as const }
              : {}),
            researchStatus: "ready",
            companyConfirmedAt: workspace.updatedAt,
          }
        : null,
  };
  const roles = previewRoles(status);
  const steps = getOrgOnboardingSteps({
    showProfile: !(flow === "additional" && profileReady),
    showCompanyDetails: flow === "new" || flow === "additional",
    showCompany:
      flow === "additional" ||
      canProvideOrgCompanyContext(members, currentMember),
    showSlack: true,
    showPlan: flow === "new",
    roles,
  });
  const availableScreens = screens.filter((item) =>
    item.id === "entry"
      ? flow === "new"
      : item.id === "organization-create"
        ? flow === "additional"
        : item.step !== null && steps.includes(item.step)
  );
  return {
    currentMember,
    members,
    workspace: previewWorkspace,
    roles,
    availableScreens,
  };
}

export default function OrgOnboardingPreview() {
  const router = useRouter();
  if (!router.isReady) return null;
  const flow =
    flows.find((item) => item.value === router.query.flow)?.value ?? "first";
  const authority =
    router.query.authority === "admin" || router.query.authority === "viewer"
      ? router.query.authority
      : "owner";
  const profileReady = router.query.profile !== "empty";
  const status = ["none", "active", "paused", "ended"].includes(
    String(router.query.roleStatus)
  )
    ? String(router.query.roleStatus)
    : router.query.roleStatus === "draft" ||
        (flow !== "new" && flow !== "additional")
      ? "draft"
      : "none";
  const setup = previewSetup(flow, authority, profileReady, status);
  const screen =
    setup.availableScreens.find((item) => item.id === router.query.screen) ??
    setup.availableScreens[0];
  const slackState = ["on", "off", "channel"].includes(
    String(router.query.slack)
  )
    ? String(router.query.slack)
    : "auto";
  return (
    <PreviewSession
      key={`${flow}:${authority}:${profileReady}:${screen.id}:${status}:${slackState}`}
      flow={flow}
      profileReady={profileReady}
      setup={setup}
      screen={screen}
      status={status}
      slackState={slackState}
    />
  );
}

function PreviewSession({
  flow,
  profileReady,
  setup,
  screen,
  status,
  slackState,
}: {
  flow: PreviewFlow;
  profileReady: boolean;
  setup: ReturnType<typeof previewSetup>;
  screen: (typeof screens)[number];
  status: string;
  slackState: string;
}) {
  const router = useRouter();
  const { currentMember, members, workspace, roles, availableScreens } = setup;
  const [completed, setCompleted] = useState(false);
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, enabled: false } },
    });
    const connected =
      slackState !== "off" &&
      (slackState === "on" ||
        slackState === "channel" ||
        screen.id === "slack-channel" ||
        screen.step === "done");
    client.setQueryData<OrgSlackStatus>(
      queryKeys.org.slack(workspace.workspaceId),
      {
        connected,
        teamId: connected ? "T_PREVIEW" : null,
        teamName: connected ? workspace.companyName : null,
        needsReinstall: false,
        canCreateChannels: true,
        channels:
          connected &&
          (slackState === "channel" ||
            (slackState === "auto" && screen.step === "done"))
            ? [channel]
            : [],
        availableChannels,
      }
    );
    return client;
  });
  const context: OrgWorkspaceContextValue = {
    bootstrap: {
      ok: true,
      currentUser: currentMember,
      members,
      invitations: [],
      workspace,
      workspaces: [workspace],
      roles,
    },
    currentUser: currentMember,
    currentUserEmail: currentMember.email,
    internalOpsAccess: false,
    orgId: workspace.workspaceId,
    page: "onboarding",
    permissions: getOrgPermissions(currentMember.authority),
    roles,
    workspace,
    workspaces: [workspace],
    user: {
      id: member.userId,
      email: member.email ?? undefined,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: member.joinedAt,
    },
  };
  const navigate = (id: string, roleStatus = status) => {
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, screen: id, roleStatus },
      },
      undefined,
      { shallow: true }
    );
  };
  const changeConditions = (patch: Record<string, string>) => {
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, ...patch } },
      undefined,
      { shallow: true }
    );
  };
  const updateSlack = (patch: Partial<OrgSlackStatus>) => {
    queryClient.setQueryData<OrgSlackStatus>(
      queryKeys.org.slack(workspace.workspaceId),
      (previous) => (previous ? { ...previous, ...patch } : previous)
    );
  };
  return (
    <QueryClientProvider client={queryClient}>
      <OrgWorkspaceProvider value={context}>
        {router.query.clean !== "1" ? (
          <header className="sticky top-0 z-40 border-b border-neutral-1000-a10 bg-bg-floating px-4 py-2">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
              <Select
                items={[...flows]}
                value={flow}
                onValueChange={(value) => {
                  if (!value) return;
                  changeConditions({
                    flow: value,
                    screen:
                      value === "new"
                        ? "entry"
                        : value === "additional"
                          ? "organization-create"
                          : "profile",
                    roleStatus:
                      value === "new" || value === "additional"
                        ? "none"
                        : status,
                  });
                }}
              >
                <SelectTrigger aria-label="미리보기 가입 흐름" className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {flows.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={currentMember.authority}
                disabled={flow === "new" || flow === "additional"}
                onValueChange={(value) =>
                  value && changeConditions({ authority: value })
                }
              >
                <SelectTrigger aria-label="미리보기 팀원 권한" className="w-36">
                  <SelectValue>{`권한: ${currentMember.authority === "owner" ? "Owner" : currentMember.authority === "admin" ? "Admin" : "Viewer"}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">권한: Owner</SelectItem>
                  <SelectItem value="admin">권한: Admin</SelectItem>
                  <SelectItem value="viewer">권한: Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={profileReady ? "ready" : "empty"}
                onValueChange={(value) =>
                  value && changeConditions({ profile: value })
                }
              >
                <SelectTrigger
                  aria-label="미리보기 이름과 직함 입력 상태"
                  className="w-48"
                >
                  <SelectValue>
                    {profileReady ? "이름·직함: 입력됨" : "이름·직함: 미입력"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ready">이름·직함: 입력됨</SelectItem>
                  <SelectItem value="empty">이름·직함: 미입력</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <nav
              aria-label="온보딩 미리보기 화면"
              className="flex flex-wrap items-center justify-center gap-1"
            >
              {availableScreens.map((item) => (
                <MuteButton
                  key={item.id}
                  size="sm"
                  variant={screen.id === item.id ? "neutral" : "transparent"}
                  aria-current={screen.id === item.id ? "page" : undefined}
                  disabled={item.step === "roles" && status === "none"}
                  onClick={() => navigate(item.id)}
                >
                  {item.label}
                </MuteButton>
              ))}
              <Select
                value={status}
                onValueChange={(value) =>
                  navigate(
                    value === "none" ? "done" : "roles",
                    value ?? "draft"
                  )
                }
              >
                <SelectTrigger aria-label="미리보기 역할 상태" className="w-32">
                  <SelectValue>
                    {status === "none"
                      ? "역할: 없음"
                      : status === "active"
                        ? "역할: 채용 중"
                        : status === "paused"
                          ? "역할: 중단"
                          : status === "ended"
                            ? "역할: 종료"
                            : "역할: 초안"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">역할: 없음</SelectItem>
                  <SelectItem value="draft">역할: 초안</SelectItem>
                  <SelectItem value="active">역할: 채용 중</SelectItem>
                  <SelectItem value="paused">역할: 중단</SelectItem>
                  <SelectItem value="ended">역할: 종료</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={slackState}
                onValueChange={(value) => {
                  if (!value) return;
                  void router.replace(
                    {
                      pathname: router.pathname,
                      query: { ...router.query, slack: value },
                    },
                    undefined,
                    { shallow: true }
                  );
                }}
              >
                <SelectTrigger
                  aria-label="미리보기 Slack 연결 상태"
                  className="w-40"
                >
                  <SelectValue>
                    {slackState === "off"
                      ? "Slack: 연결 안 됨"
                      : slackState === "on"
                        ? "Slack: 채널 미연결"
                        : slackState === "channel"
                          ? "Slack: 채널 연결됨"
                          : "Slack: 화면 기본값"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Slack: 화면 기본값</SelectItem>
                  <SelectItem value="off">Slack: 연결 안 됨</SelectItem>
                  <SelectItem value="on">Slack: 채널 미연결</SelectItem>
                  <SelectItem value="channel">Slack: 채널 연결됨</SelectItem>
                </SelectContent>
              </Select>
            </nav>
            <p
              className="mt-1 text-center text-[12px] text-neutral-soft"
              role="status"
            >
              {completed
                ? "완료 버튼을 확인했어요. 실제 완료 기록이나 Slack 앱 실행은 하지 않았어요."
                : "개발용 미리보기 · 예시 데이터 · Workspace 생성, 저장, 초대 메일, Slack 연결, 결제, AI 호출은 실제로 실행되지 않습니다."}
            </p>
            {flow === "new" ? (
              <p className="mt-1 text-center text-[12px] text-neutral-muted">
                신규 Workspace 자동 생성은 현재 일반 진입에서 중단되어 있어요.
                이 선택지는 생성 흐름을 확인하는 미리보기예요.
              </p>
            ) : null}
          </header>
        ) : null}
        {screen.id === "entry" ? (
          <OrgSignupEntry
            email={currentMember.email ?? undefined}
            preview={{ onBegin: () => navigate("profile") }}
          />
        ) : screen.id === "organization-create" ? (
          <OrgOrganizationCreationPage
            preview={{
              onCreate: () => navigate("company-details"),
              onCancel: () => navigate("organization-create"),
            }}
          />
        ) : (
          <OrgOnboardingFlow
            initiallyConnected={false}
            preview={{
              step: screen.step ?? "profile",
              onStepChange: (step) => navigate(step),
              onComplete: () => setCompleted(true),
              companyReply:
                "미리보기 응답이에요. 실제 온보딩에서는 Harper가 입력한 회사 이야기를 읽고 회사 정보에 반영한 내용을 이곳에서 안내해 드려요.",
              slack: {
                inviteOpen: screen.id === "slack-invite",
                connect: () =>
                  updateSlack({
                    connected: true,
                    teamId: "T_PREVIEW",
                    teamName: workspace.companyName,
                  }),
                connectChannel: (channelId, channelName) =>
                  updateSlack({
                    channels: [
                      {
                        ...channel,
                        channelId: channelId || channel.channelId,
                        channelName:
                          channelName ||
                          availableChannels.find(
                            (item) => item.channelId === channelId
                          )?.channelName ||
                          channel.channelName,
                        isPrivate:
                          availableChannels.find(
                            (item) => item.channelId === channelId
                          )?.isPrivate ?? false,
                      },
                    ],
                    availableChannels: [],
                  }),
              },
            }}
          />
        )}
      </OrgWorkspaceProvider>
    </QueryClientProvider>
  );
}
