import Head from "next/head";
import type { ReactNode } from "react";
import { OrgLoginScreen } from "@/components/org/OrgLoginScreen";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  OrgWorkspaceSidebar,
  OrgWorkspaceShellSkeleton,
} from "@/components/org/workspace/OrgWorkspaceSidebar";
import {
  OrgWorkspaceProvider,
  useOrgWorkspaceController,
} from "@/hooks/org/useOrgWorkspace";
import type { OrgWorkspacePageId } from "@/lib/org/routes";

export function OrgWorkspaceApp({
  children,
  legacyEntry = false,
  page,
}: {
  children: ReactNode;
  legacyEntry?: boolean;
  page: OrgWorkspacePageId;
}) {
  const {
    authLoading,
    bootstrapQuery,
    contextValue,
    orgId,
    routerReady,
    user,
    workspace,
  } = useOrgWorkspaceController({ legacyEntry, page });

  if (authLoading || !routerReady) {
    return <OrgWorkspaceShellSkeleton />;
  }
  if (!user) {
    return <OrgLoginScreen orgId={orgId} />;
  }
  if (bootstrapQuery.isLoading) {
    return <OrgWorkspaceShellSkeleton />;
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
    return <OrgWorkspaceShellSkeleton />;
  }
  if (!workspace || !contextValue) {
    return <OrgLoginScreen authenticatedEmail={user.email} />;
  }

  const pageTitle = `${workspace.companyName} · ${page[0].toUpperCase()}${page.slice(1)}`;

  return (
    <OrgWorkspaceProvider value={contextValue}>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <Page
        as="main"
        background="neutral"
        className="font-sans text-neutral-primary"
      >
        <OrgWorkspaceSidebar />
        <div className="lg:pl-[256px]">
          <PageContainer
            key={workspace.workspaceId}
            className="py-6 sm:py-9 lg:py-10"
            padding="default"
            size={page === "jobs" ? "wide" : "default"}
          >
            {children}
          </PageContainer>
        </div>
      </Page>
    </OrgWorkspaceProvider>
  );
}
