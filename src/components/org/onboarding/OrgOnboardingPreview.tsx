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
import { getOrgPermissions } from "@/lib/org/permissions";
import type { OrgOnboardingStep } from "@/lib/org/onboarding";
import type { OrgMember, OrgRole, OrgWorkspace } from "@/lib/org/server";
import { queryKeys } from "@/lib/queryKeys";
import { OrgOnboardingFlow } from "./OrgOnboardingPage";

const screens = [
  { id: "profile", step: "profile", label: "1. 환영" },
  { id: "slack", step: "slack", label: "2. Slack" },
  { id: "slack-channel", step: "slack", label: "채널 연결" },
  { id: "slack-invite", step: "slack", label: "다른 계정 초대" },
  { id: "company", step: "company", label: "3. 회사 소개" },
  { id: "roles", step: "roles", label: "4. 역할" },
  { id: "done", step: "done", label: "5. 완료" },
] as const satisfies ReadonlyArray<{
  id: string;
  step: OrgOnboardingStep;
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

export default function OrgOnboardingPreview() {
  const router = useRouter();
  if (process.env.NODE_ENV === "production" || !router.isReady) return null;
  const screen =
    screens.find((item) => item.id === router.query.screen) ?? screens[0];
  const status = ["active", "paused", "ended"].includes(
    String(router.query.roleStatus)
  )
    ? String(router.query.roleStatus)
    : "draft";
  return (
    <PreviewSession
      key={`${screen.id}:${status}`}
      screen={screen}
      status={status}
    />
  );
}

function PreviewSession({
  screen,
  status,
}: {
  screen: (typeof screens)[number];
  status: string;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(false);
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, enabled: false } },
    });
    const connected = screen.id === "slack-channel" || screen.step === "done";
    client.setQueryData<OrgSlackStatus>(
      queryKeys.org.slack(workspace.workspaceId),
      {
        connected,
        teamId: connected ? "T_PREVIEW" : null,
        teamName: connected ? workspace.companyName : null,
        needsReinstall: false,
        canCreateChannels: true,
        channels: screen.step === "done" ? [channel] : [],
        availableChannels,
      }
    );
    return client;
  });
  const roles: OrgRole[] = [
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
  const context: OrgWorkspaceContextValue = {
    bootstrap: {
      ok: true,
      currentUser: member,
      members: [member],
      invitations: [],
      workspace,
      workspaces: [workspace],
      roles,
    },
    currentUser: member,
    currentUserEmail: member.email,
    internalOpsAccess: false,
    orgId: workspace.workspaceId,
    page: "onboarding",
    permissions: getOrgPermissions(member.authority),
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
            <nav
              aria-label="온보딩 미리보기 화면"
              className="flex flex-wrap items-center justify-center gap-1"
            >
              {screens.map((item) => (
                <MuteButton
                  key={item.id}
                  size="sm"
                  variant={screen.id === item.id ? "neutral" : "transparent"}
                  aria-current={screen.id === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  {item.label}
                </MuteButton>
              ))}
              <Select
                value={status}
                onValueChange={(value) => navigate("roles", value ?? "draft")}
              >
                <SelectTrigger aria-label="미리보기 역할 상태" className="w-32">
                  <SelectValue>
                    {status === "active"
                      ? "역할: 채용 중"
                      : status === "paused"
                        ? "역할: 중단"
                        : status === "ended"
                          ? "역할: 종료"
                          : "역할: 초안"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">역할: 초안</SelectItem>
                  <SelectItem value="active">역할: 채용 중</SelectItem>
                  <SelectItem value="paused">역할: 중단</SelectItem>
                  <SelectItem value="ended">역할: 종료</SelectItem>
                </SelectContent>
              </Select>
            </nav>
            <p
              className="mt-1 text-center text-[12px] text-neutral-soft"
              role="status"
            >
              {completed
                ? "완료 버튼을 확인했어요. 실제 완료 기록이나 Slack 앱 실행은 하지 않았어요."
                : "개발용 미리보기 · 예시 데이터 · 저장, 초대 메일, Slack 연결, AI 호출은 실제로 실행되지 않습니다."}
            </p>
          </header>
        ) : null}
        <OrgOnboardingFlow
          initiallyConnected={false}
          preview={{
            step: screen.step,
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
      </OrgWorkspaceProvider>
    </QueryClientProvider>
  );
}
