import { useOrgNavigation } from "@/hooks/org/useOrgNavigation";
import { OrgPageLoading } from "./OrgPageLoading";
// Self-serve signup is paused while payments are being tested.
// import { OrgSignupEntry } from "@/components/org/onboarding/OrgSignupEntry";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactNode } from "react";
import { OrgLoginScreen } from "@/components/org/OrgLoginScreen";
import { OrgAnnouncement } from "@/components/org/OrgAnnouncement";
import { Page } from "@/components/layout/Page";
import { PageContainer } from "@/components/layout/PageContainer";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import {
  OrgWorkspaceSidebar,
  OrgWorkspaceShellSkeleton,
} from "@/components/org/workspace/OrgWorkspaceSidebar";
import type { OrgDocumentsHeading } from "@/components/org/workspace/OrgDocumentsMarkdown";
import { OrgMobileNavigationProvider } from "@/components/org/workspace/OrgMobileNavigation";
import {
  OrgWorkspaceProvider,
  useOrgWorkspaceController,
} from "@/hooks/org/useOrgWorkspace";
import type { OrgWorkspacePageId } from "@/lib/org/routes";
import { cn } from "@/lib/utils";
import {
  isAdditionalOrgCreator,
  isOrgOnboardingComplete,
} from "@/lib/org/signup";

export function OrgWorkspaceApp({
  children,
  documentSections,
  legacyEntry = false,
  page,
}: {
  children: ReactNode;
  documentSections?: readonly OrgDocumentsHeading[];
  legacyEntry?: boolean;
  page: OrgWorkspacePageId;
}) {
  const { c } = useOrgLocale();
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
  const navigation = useOrgNavigation(workspace?.workspaceId ?? "");
  const displayPage = navigation?.page ?? page;
  const isRoleWorkspacePage =
    displayPage === "new-role" || displayPage === "role";
  const isRoleCreationStarted = false;
  // const isRoleCreationStarted =
  //   isRoleCreationPage &&
  //   typeof router.query.roleId === "string" &&
  //   Boolean(router.query.roleId.trim());

  const useWideLayout =
    displayPage === "documents" ||
    displayPage === "inbox" ||
    displayPage === "jobs" ||
    isRoleWorkspacePage;

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
              : c(
                  "Organization을 불러오지 못했습니다.",
                  "Failed to load organization."
                )
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
    // return <OrgSignupEntry email={user.email} />;
    return <OrgLoginScreen authenticatedEmail={user.email} />;
  }

  const pageTitle = isRoleWorkspacePage
    ? `${workspace.companyName} · ${page === "new-role" ? c("새 역할 등록", "Create new role") : c("역할", "Role")}`
    : `${workspace.companyName} · ${page === "personal-settings" ? c("개인 설정", "Personal settings") : `${page[0].toUpperCase()}${page.slice(1)}`}`;
  const requiresOnboarding =
    (!contextValue.internalOpsAccess ||
      isAdditionalOrgCreator(workspace.signupState, user.id)) &&
    Boolean(contextValue.currentUser) &&
    !isOrgOnboardingComplete(
      workspace.signupState,
      contextValue.currentUser,
      user.id
    );

  if (navigation && !navigation.sameWorkspace)
    return <OrgWorkspaceShellSkeleton />;

  if (page === "onboarding") {
    return (
      <OrgWorkspaceProvider value={{ ...contextValue, page: displayPage }}>
        {children}
      </OrgWorkspaceProvider>
    );
  }
  if (requiresOnboarding) return <OrgWorkspaceShellSkeleton />;

  return (
    <OrgWorkspaceProvider value={{ ...contextValue, page: displayPage }}>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <OrgMobileNavigationProvider>
        <Page
          as="main"
          background="neutral"
          className="overflow-x-clip overflow-y-auto overscroll-y-none font-sans text-neutral-primary"
          minHeight="fillScreen"
        >
          <OrgWorkspaceSidebar
            compact={isRoleCreationStarted}
            documentSections={documentSections}
          />
          <div
            className={cn(
              page === "role" ? "md:pt-0" : "pt-12 md:pt-0",
              isRoleCreationStarted ? "md:pl-[72px]" : "md:pl-[256px]"
            )}
          >
            <PageContainer
              key={workspace.workspaceId}
              className={cn(
                page === "role"
                  ? "h-svh min-h-[520px] md:h-screen md:min-h-0"
                  : page === "new-role"
                    ? "h-[calc(100svh-3rem)] min-h-[472px] md:h-screen md:min-h-0"
                    : "py-6 sm:py-9 lg:py-10"
              )}
              padding={isRoleWorkspacePage ? "none" : "default"}
              size={
                isRoleWorkspacePage ? "full" : useWideLayout ? "wide" : "narrow"
              }
            >
              {navigation ? <OrgPageLoading page={displayPage} /> : children}
            </PageContainer>
          </div>
        </Page>
      </OrgMobileNavigationProvider>
      {!navigation && page === "home" && router.pathname === "/org/home" && (
        <OrgAnnouncement userId={user.id} workspaceId={workspace.workspaceId} />
      )}
    </OrgWorkspaceProvider>
  );
}
