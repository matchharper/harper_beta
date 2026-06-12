import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerSettingsModal from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen, {
  CareerLoadingState,
} from "@/components/career/CareerWorkspaceScreen";
import { getCareerWorkspaceHref, getCareerWorkspaceTabFromPath, type CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerVisitLog } from "@/hooks/career/useCareerVisitLog";
import { useTalentOnboardingRedirect } from "@/hooks/career/useTalentOnboardingStatus";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";

const CareerWorkspacePage = ({
  activeTab,
}: {
  activeTab: CareerWorkspaceTab;
}) => {
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { user, authLoading } = useCareerAuth();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const isRouterReady = router.isReady;
  const inviteToken =
    isRouterReady && typeof router.query.invite === "string"
      ? router.query.invite
      : null;
  const mail =
    isRouterReady && typeof router.query.mail === "string"
      ? router.query.mail
      : null;
  const emailOnboardingToken =
    isRouterReady &&
    typeof router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] === "string"
      ? router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]
      : null;

  const currentActiveTab = useMemo(
    () =>
      isRouterReady ? getCareerWorkspaceTabFromPath(router.asPath) : activeTab,
    [activeTab, isRouterReady, router.asPath]
  );

  useTalentOnboardingRedirect({
    enabled: !authLoading && isRouterReady && Boolean(user),
    emailOnboardingToken,
    inviteToken,
    mail,
  });
  useCareerVisitLog(!authLoading && isRouterReady && Boolean(user));

  useEffect(() => {
    if (authLoading || !isRouterReady || user) return;

    void router.replace({
      pathname: "/career_login",
      query: { next: router.asPath || getCareerWorkspaceHref(activeTab) },
    });
  }, [activeTab, authLoading, isRouterReady, router, user]);

  const handleOpenSettings = useCallback(() => {
    logCareerEvent("click_open_settings");
    setIsSettingsModalOpen(true);
  }, [logCareerEvent]);

  const handleChangeTab = useCallback(
    (
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
      if (emailOnboardingToken && nextHref.startsWith("/career")) {
        query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM] = emailOnboardingToken;
      }

      if (historyTarget) {
        logCareerEvent(
          `click_open_history_${historyTarget.historyTab}${
            historyTarget.savedStage ? `_${historyTarget.savedStage}` : ""
          }`
        );
      } else {
        logCareerEvent(`click_nav_${nextTab}`);
      }

      const nextQuery = Object.keys(query).length > 0 ? query : undefined;

      void router.push(
        {
          pathname: nextHref,
          query: nextQuery,
        },
        undefined,
        { scroll: false, shallow: true }
      );
    },
    [emailOnboardingToken, inviteToken, logCareerEvent, mail, router]
  );

  let pageContent: ReactNode;

  if (authLoading || !isRouterReady) {
    pageContent = <CareerLoadingState />;
  } else if (!user) {
    pageContent = <CareerLoadingState />;
  } else {
    pageContent = (
      <CareerFlowProvider
        emailOnboardingToken={emailOnboardingToken}
        inviteToken={inviteToken}
        mail={mail}
        onOpenSettings={handleOpenSettings}
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
    <>
      <Head>
        <meta
          key="viewport"
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
      </Head>
      {pageContent}
    </>
  );
};

export default CareerWorkspacePage;
