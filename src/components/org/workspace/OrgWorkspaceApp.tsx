import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { OrgLoginScreen } from "@/components/org/OrgLoginScreen";
import { OrgMemberProfileDialog } from "@/components/org/OrgMemberProfileDialog";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgSlackConnectionGate } from "@/components/org/workspace/OrgSlackConnectionGate";
import {
  OrgWorkspaceSidebar,
  OrgWorkspaceShellSkeleton,
} from "@/components/org/workspace/OrgWorkspaceSidebar";
import {
  OrgWorkspaceProvider,
  useOrgWorkspaceController,
} from "@/hooks/org/useOrgWorkspace";
import type { OrgWorkspacePageId } from "@/lib/org/routes";
import { cn } from "@/lib/utils";

export function OrgWorkspaceApp({
  children,
  legacyEntry = false,
  page,
}: {
  children: ReactNode;
  legacyEntry?: boolean;
  page: OrgWorkspacePageId;
}) {
  const router = useRouter();
  const {
    authLoading,
    bootstrapQuery,
    contextValue,
    orgId,
    routerReady,
    user,
    workspace,
  } = useOrgWorkspaceController({ legacyEntry, page });
  const isRoleCreationPage = page === "new-role";
  const isRoleCreationStarted = false;
  // const isRoleCreationStarted =
  //   isRoleCreationPage &&
  //   typeof router.query.roleId === "string" &&
  //   Boolean(router.query.roleId.trim());

  const useWideLayout =
    page === "all" || page === "inbox" || page === "jobs" || isRoleCreationPage;

  if (authLoading || !routerReady) {
    return (
      <OrgWorkspaceShellSkeleton
        compact={isRoleCreationStarted}
        wide={useWideLayout}
      />
    );
  }
  if (!user) {
    return <OrgLoginScreen orgId={orgId} />;
  }
  if (bootstrapQuery.isLoading) {
    return (
      <OrgWorkspaceShellSkeleton
        compact={isRoleCreationStarted}
        wide={useWideLayout}
      />
    );
  }
  if (bootstrapQuery.error) {
    return (
      <Page
        as="main"
        background="neutral"
        className="items-center justify-center px-4 font-sans"
      >
        <OrgErrorState
          className="w-full max-w-md"
          message={
            bootstrapQuery.error instanceof Error
              ? bootstrapQuery.error.message
              : "Organization을 불러오지 못했습니다."
          }
          onRetry={() => void bootstrapQuery.refetch()}
        />
      </Page>
    );
  }
  if (orgId && !workspace) {
    return (
      <OrgWorkspaceShellSkeleton
        compact={isRoleCreationStarted}
        wide={useWideLayout}
      />
    );
  }
  if (!workspace || !contextValue) {
    return <OrgLoginScreen authenticatedEmail={user.email} />;
  }

  const pageTitle = isRoleCreationPage
    ? `${workspace.companyName} · 새 역할 등록`
    : `${workspace.companyName} · ${page[0].toUpperCase()}${page.slice(1)}`;
  const requiresMemberProfile =
    !contextValue.internalOpsAccess &&
    Boolean(contextValue.currentUser) &&
    !contextValue.currentUser?.role?.trim();

  return (
    <OrgWorkspaceProvider value={contextValue}>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <Page
        as="main"
        background="neutral"
        className="overflow-x-clip overflow-y-auto overscroll-y-none font-sans text-neutral-primary"
        minHeight="fillScreen"
      >
        <OrgWorkspaceSidebar compact={isRoleCreationStarted} />
        <div
          className={isRoleCreationStarted ? "lg:pl-[72px]" : "lg:pl-[256px]"}
        >
          <PageContainer
            key={workspace.workspaceId}
            className={cn(
              isRoleCreationPage
                ? "h-[calc(100svh-104px)] min-h-[560px] lg:h-screen lg:min-h-0"
                : "py-6 sm:py-9 lg:py-10"
            )}
            padding={isRoleCreationPage ? "none" : "default"}
            size={
              isRoleCreationPage ? "full" : useWideLayout ? "wide" : "narrow"
            }
          >
            {children}
          </PageContainer>
        </div>
      </Page>
      {requiresMemberProfile && contextValue.currentUser ? (
        <OrgMemberProfileDialog
          key={workspace.workspaceId}
          member={contextValue.currentUser}
          workspace={workspace}
        />
      ) : (
        <OrgSlackConnectionGate>{null}</OrgSlackConnectionGate>
      )}
    </OrgWorkspaceProvider>
  );
}
