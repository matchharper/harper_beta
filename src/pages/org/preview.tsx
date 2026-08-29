import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import { UserPlus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { OrgRoleStatusDot } from "@/components/org/OrgRoleStatusDot";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { OrgMobileNavigationProvider } from "@/components/org/workspace/OrgMobileNavigation";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { OrgWorkspaceSidebar } from "@/components/org/workspace/OrgWorkspaceSidebar";
import { CardButton } from "@/components/ui/button";
import {
  OrgWorkspaceProvider,
  type OrgWorkspaceContextValue,
} from "@/hooks/org/useOrgWorkspace";
import type { OrgSlackStatus } from "@/hooks/org/useOrgSlack";
import { getOrgPermissions } from "@/lib/org/permissions";
import type {
  OrgBoardResponse,
  OrgBootstrapResponse,
  OrgMember,
  OrgRole,
  OrgWorkspace,
} from "@/lib/org/server";
import { queryKeys } from "@/lib/queryKeys";

const PREVIEW_WORKSPACE_ID = "org-preview-workspace";
const PREVIEW_NOW = "2026-08-20T00:00:00.000Z";

const previewWorkspace: OrgWorkspace = {
  companyDescription:
    "AI 제품을 만드는 팀이 더 좋은 동료를 만날 수 있도록 돕습니다.",
  companyName: "Harper Labs",
  logoUrl: null,
  pitch: "Build meaningful teams with AI.",
  request: null,
  updatedAt: PREVIEW_NOW,
  workspaceId: PREVIEW_WORKSPACE_ID,
};

const previewMember: OrgMember = {
  authority: "owner",
  email: "preview@harper.team",
  joinedAt: PREVIEW_NOW,
  name: "김하퍼",
  profilePicture: null,
  role: "People Lead",
  userId: "org-preview-user",
};

const previewUser: User = {
  app_metadata: {},
  aud: "authenticated",
  created_at: PREVIEW_NOW,
  email: previewMember.email ?? undefined,
  id: previewMember.userId,
  role: "authenticated",
  user_metadata: { name: previewMember.name },
};

const previewRoles: OrgRole[] = [
  {
    criteria: [],
    createdAt: "2026-08-18T00:00:00.000Z",
    description: "제품과 모델 경험을 함께 설계하는 역할",
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    locationText: "Seoul · Hybrid",
    name: "Founding Product Designer",
    request: null,
    roleId: "preview-role-design",
    status: "active",
    updatedAt: PREVIEW_NOW,
    workMode: "hybrid",
    workspaceId: PREVIEW_WORKSPACE_ID,
  },
  {
    criteria: [],
    createdAt: "2026-08-12T00:00:00.000Z",
    description: "LLM 제품의 백엔드와 평가 시스템을 만드는 역할",
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    locationText: "Remote",
    name: "Senior AI Engineer",
    request: null,
    roleId: "preview-role-ai",
    status: "active",
    updatedAt: PREVIEW_NOW,
    workMode: "remote",
    workspaceId: PREVIEW_WORKSPACE_ID,
  },
  {
    criteria: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    description: "초기 고객과 제품 사이를 연결하는 역할",
    employmentTypes: ["full_time"],
    externalJdUrl: null,
    locationText: "Seoul",
    name: "Product Operations",
    request: null,
    roleId: "preview-role-ops",
    status: "paused",
    updatedAt: PREVIEW_NOW,
    workMode: "onsite",
    workspaceId: PREVIEW_WORKSPACE_ID,
  },
];

const previewBootstrap: OrgBootstrapResponse = {
  currentUser: previewMember,
  invitations: [],
  members: [previewMember],
  ok: true,
  roles: previewRoles,
  workspace: previewWorkspace,
  workspaces: [previewWorkspace],
};

const previewInbox: OrgBoardResponse = {
  items: [
    {
      criteriaEvaluations: [
        {
          content: "AI 제품을 초기 단계부터 설계하고 출시한 경험이 있습니다.",
          fitness: "excellent",
          name: "0→1 제품 구축",
        },
        {
          content: "복잡한 요구사항을 제품 경험으로 정리한 근거가 있습니다.",
          fitness: "good",
          name: "제품 문제 해결",
        },
      ],
      createdAt: PREVIEW_NOW,
      fitReasons: ["0→1 제품 경험", "AI 제품 디자인 경험"],
      fitSummary: "초기 AI 제품 경험과 높은 제품 오너십이 잘 맞습니다.",
      recommendedAt: PREVIEW_NOW,
      recommendationId: "preview-recommendation",
      roleId: "preview-role-design",
      roleName: "Founding Product Designer",
      stage: "pending_connection",
      stageTag: null,
      talent: {
        email: null,
        headline: "Product designer building AI-native experiences",
        name: "이디자인",
        profilePicture: null,
        recentCompanies: [],
        recentSchools: [],
        userId: "preview-talent",
      },
      talentId: "preview-talent",
      upcomingMeeting: null,
      updatedAt: PREVIEW_NOW,
    },
  ],
  roleId: null,
  stages: [],
  totalCount: 1,
  workspaceId: PREVIEW_WORKSPACE_ID,
};

const previewSlack: OrgSlackStatus = {
  availableChannels: [],
  canCreateChannels: true,
  channels: [
    {
      channelId: "preview-channel",
      channelName: "hiring",
      defaultRoleId: null,
      isEnabled: true,
      isPrivate: false,
      replyToHarperThreads: true,
      respondToMentions: true,
    },
  ],
  connected: true,
  needsReinstall: false,
  teamId: "preview-team",
  teamName: "Harper Labs",
};

const previewContext: OrgWorkspaceContextValue = {
  bootstrap: previewBootstrap,
  currentUser: previewMember,
  currentUserEmail: previewMember.email,
  internalOpsAccess: false,
  orgId: PREVIEW_WORKSPACE_ID,
  page: "home",
  permissions: getOrgPermissions(previewMember.authority),
  roles: previewRoles,
  user: previewUser,
  workspace: previewWorkspace,
  workspaces: [previewWorkspace],
};

const roleRows = [
  { name: "Founding Product Designer", pending: 1, status: "active" },
  { name: "Senior AI Engineer", pending: 0, status: "active" },
  { name: "Product Operations", pending: 0, status: "paused" },
];

function PreviewHome() {
  return (
    <div className="space-y-8">
      <OrgPageHeader title="Home" />
      <OrgSection>
        <OrgSectionHeader
          description="2 active · 1 paused · 1 waiting"
          title="Hiring"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3 pb-2 text-[14px] font-light text-neutral-soft sm:grid-cols-[minmax(0,1fr)_88px]">
          <span>Role</span>
          <span className="hidden text-right sm:block">연결 대기</span>
        </div>
        <div className="divide-y divide-neutral-1000-a05">
          {roleRows.map((role) => (
            <div
              className="grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_88px]"
              key={role.name}
            >
              <span className="flex min-w-0 items-center gap-2">
                <OrgRoleStatusDot status={role.status} />
                <span className="min-w-0 truncate text-[14px] font-medium text-neutral-primary">
                  {role.name}
                </span>
              </span>
              <span
                className={
                  role.pending > 0
                    ? "hidden text-right text-sm font-medium text-primary sm:block"
                    : "hidden text-right text-sm font-light text-neutral-soft sm:block"
                }
              >
                {role.pending > 0 ? `${role.pending}명 대기` : "대기 없음"}
              </span>
            </div>
          ))}
        </div>
      </OrgSection>
      <div className="mt-10 grid w-full max-w-[660px] grid-cols-3 gap-3 sm:mt-12">
        <CardButton
          className="min-h-[132px] min-w-0 flex-col items-start gap-0 rounded-xl border-neutral-1000-a10 bg-bg-default px-4 py-4 shadow-none hover:border-neutral-1000-a20 hover:bg-bg-weak"
          onClick={() => undefined}
        >
          <span className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-weak">
            <Image
              alt=""
              height={18}
              src="/images/logos/slack.svg"
              width={18}
            />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[14px] font-medium">Slack 연결</span>
            <span className="line-clamp-2 text-[13px] font-light leading-4 text-neutral-muted">
              #hiring 연결됨
            </span>
          </span>
        </CardButton>
        <CardButton
          className="min-h-[132px] min-w-0 flex-col items-start gap-0 rounded-xl border-neutral-1000-a10 bg-bg-default px-4 py-4 shadow-none hover:border-neutral-1000-a20 hover:bg-bg-weak"
          onClick={() => undefined}
        >
          <span className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-weak text-[12px] font-medium text-neutral-muted">
            H
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[14px] font-medium">회사 정보</span>
            <span className="line-clamp-2 text-[13px] font-light leading-4 text-neutral-muted">
              후보자에게 보여질 수 있는 회사 정보를 관리하세요.
            </span>
          </span>
        </CardButton>
        <CardButton
          className="min-h-[132px] min-w-0 flex-col items-start gap-0 rounded-xl border-neutral-1000-a10 bg-bg-default px-4 py-4 shadow-none hover:border-neutral-1000-a20 hover:bg-bg-weak"
          onClick={() => undefined}
        >
          <span className="mb-3 flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-weak">
            <UserPlus aria-hidden="true" className="size-5" strokeWidth={1.7} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[14px] font-medium">멤버 초대</span>
            <span className="line-clamp-2 text-[13px] font-light leading-4 text-neutral-muted">
              함께 후보자를 검토할 팀원을 초대하세요.
            </span>
          </span>
        </CardButton>
      </div>
    </div>
  );
}

function OrgWorkspacePreview() {
  const queryClient = useQueryClient();
  useState(() => {
    queryClient.setQueryData(
      queryKeys.org.inbox(PREVIEW_WORKSPACE_ID),
      previewInbox
    );
    queryClient.setQueryData(
      queryKeys.org.slack(PREVIEW_WORKSPACE_ID),
      previewSlack
    );
    return true;
  });

  const keepPreviewStatic = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a");
    if (link?.getAttribute("href")?.startsWith("/org")) {
      event.preventDefault();
    }
    if (
      target.closest('[role="menuitem"]')?.textContent?.includes("로그아웃")
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <OrgWorkspaceProvider value={previewContext}>
      <Head>
        <title>Harper Labs · Organization Preview</title>
      </Head>
      <OrgMobileNavigationProvider>
        <Page
          as="main"
          background="neutral"
          className="overflow-x-clip overflow-y-auto overscroll-y-none font-sans text-neutral-primary"
          minHeight="fillScreen"
          onClickCapture={keepPreviewStatic}
        >
          <OrgWorkspaceSidebar />
          <div className="pt-12 md:pl-[256px] md:pt-0">
            <PageContainer
              className="py-6 sm:py-9 lg:py-10"
              padding="default"
              size="narrow"
            >
              <PreviewHome />
            </PageContainer>
          </div>
        </Page>
      </OrgMobileNavigationProvider>
    </OrgWorkspaceProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV === "production") {
    return { notFound: true };
  }
  return { props: {} };
};

export default OrgWorkspacePreview;
