import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerLoginGate from "@/components/career/CareerLoginGate";
import CareerMobileViewportGate from "@/components/career/CareerMobileViewportGate";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen, {
  CareerLoadingState,
} from "@/components/career/CareerWorkspaceScreen";
import {
  getCareerWorkspaceHref,
  getCareerWorkspaceTabFromPath,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { resolveCareerMobileEntryReason } from "@/lib/career/mobileBlocker";

const CareerWorkspacePage = ({
  activeTab,
}: {
  activeTab: CareerWorkspaceTab;
}) => {
  const router = useRouter();
  const { user, authLoading, authPending, authError, handleGoogleLogin } =
    useCareerAuth();
  const { fetchWithAuth } = useCareerApi();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [currentActiveTab, setCurrentActiveTab] = useState(activeTab);
  const isRouterReady = router.isReady;
  const inviteToken =
    isRouterReady && typeof router.query.invite === "string"
      ? router.query.invite
      : null;
  const mail =
    isRouterReady && typeof router.query.mail === "string"
      ? router.query.mail
      : null;
  const entryReason = resolveCareerMobileEntryReason(router.query);

  useEffect(() => {
    setCurrentActiveTab(
      isRouterReady ? getCareerWorkspaceTabFromPath(router.asPath) : activeTab
    );
  }, [activeTab, isRouterReady, router.asPath]);

  useEffect(() => {
    if (authLoading || !isRouterReady) return;

    if (!user) return;

    let cancelled = false;

    const checkOnboardingStatus = async () => {
      try {
        const response = await fetchWithAuth("/api/talent/onboarding/status");
        const payload = (await response.json().catch(() => ({}))) as {
          needsOnboarding?: boolean;
        };

        if (cancelled) return;

        const shouldRedirect = response.ok && payload.needsOnboarding === true;

        if (!shouldRedirect) return;

        const query: Record<string, string> = {};
        if (inviteToken) query.invite = inviteToken;
        if (mail) query.mail = mail;

        void router.replace({
          pathname: "/career/onboarding",
          query: Object.keys(query).length > 0 ? query : undefined,
        });
      } catch {
        // The session request below can still render the workspace. Avoid
        // blocking first paint on this redirect-only guard.
      }
    };

    void checkOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    fetchWithAuth,
    inviteToken,
    isRouterReady,
    mail,
    router,
    user,
  ]);

  const handleChangeTab = (
    nextTab: CareerWorkspaceTab,
    options?: {
      historyTarget?: {
        historyTab: "new" | "saved" | "archived";
        savedStage?: "saved" | "applied" | "connected" | "closed";
      };
    }
  ) => {
    const nextHref = getCareerWorkspaceHref(nextTab);
    const historyTarget =
      nextTab === "history" ? options?.historyTarget : undefined;
    const query: Record<string, string> = {};

    if (historyTarget) {
      query.historyTab = historyTarget.historyTab;
      if (historyTarget.savedStage) {
        query.savedStage = historyTarget.savedStage;
      }
    }

    if (inviteToken && nextHref.startsWith("/career")) {
      query.invite = inviteToken;
    }
    if (mail && nextHref.startsWith("/career")) {
      query.mail = mail;
    }

    const nextQuery = Object.keys(query).length > 0 ? query : undefined;

    setCurrentActiveTab(nextTab);
    void router.push(
      {
        pathname: nextHref,
        query: nextQuery,
      },
      undefined,
      { scroll: false, shallow: true }
    );
  };

  let pageContent: ReactNode;

  if (authLoading || !isRouterReady) {
    pageContent = <CareerLoadingState />;
  } else if (!user) {
    pageContent = (
      <CareerWorkspaceScreen>
        <CareerLoginGate
          activeTab={activeTab}
          authPending={authPending}
          authError={authError}
          onGoogleLogin={handleGoogleLogin}
        />
      </CareerWorkspaceScreen>
    );
  } else {
    pageContent = (
      <CareerFlowProvider
        inviteToken={inviteToken}
        mail={mail}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      >
        <CareerWorkspaceScreen
          activeTab={currentActiveTab}
          onChangeTab={handleChangeTab}
        />
        <CareerSettingsModal
          open={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      </CareerFlowProvider>
    );
  }

  return (
    <CareerMobileViewportGate
      desktopFallback={<CareerLoadingState />}
      entryReason={entryReason}
      user={user}
    >
      {pageContent}
    </CareerMobileViewportGate>
  );
};

export default CareerWorkspacePage;
