import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerSettingsModal, {
  type CareerSettingsTab,
} from "@/components/career/CareerSettingsModal";
import CareerWorkspaceScreen, {
  CareerLoadingState,
} from "@/components/career/CareerWorkspaceScreen";
import {
  getCareerWorkspaceHref,
  getCareerWorkspaceTabFromPath,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import type { CareerOpportunitySavedStageFilter } from "@/components/career/types";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerVisitLog } from "@/hooks/career/useCareerVisitLog";
import { useTalentOnboardingRedirect } from "@/hooks/career/useTalentOnboardingStatus";
import { useMessages } from "@/i18n/useMessage";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { supabase } from "@/lib/supabase";
import { subscribeCareerReferralModalOpen } from "@/components/career/referral/careerReferralEvents";
import {
  captureTalentNetworkReferralFromCurrentLocation,
  TALENT_NETWORK_REFERRAL_SOURCE_CAREER_PROFILE_MENU,
} from "@/lib/talentNetworkReferral";
import {
  buildOfficialJobsInitialChatDraft,
  OFFICIAL_JOBS_ONBOARDING_JOB_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
} from "@/lib/officialJobs";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";

const DELIVERY_EMAIL_HISTORY_LINK_ENTRY_PARAM = "entryPoint";
const DELIVERY_EMAIL_HISTORY_LINK_ENTRY_VALUE = "delivery_email_history_link";
const DELIVERY_EMAIL_HISTORY_LINK_EVENT =
  "opened_from_delivery_email_history_link";

const getSingleQueryParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const CareerWorkspacePage = ({
  activeTab,
}: {
  activeTab: CareerWorkspaceTab;
}) => {
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { user, authLoading } = useCareerAuth();
  const { locale } = useMessages();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<CareerSettingsTab | null>(null);
  const deliveryEmailHistoryLinkLoggedRef = useRef(false);
  const referralCaptureKeyRef = useRef("");
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
  const requestedPanel =
    isRouterReady && typeof router.query.panel === "string"
      ? router.query.panel
      : null;
  const officialJobsSource = isRouterReady
    ? getSingleQueryParam(router.query.source)
    : null;
  const officialJobsRoleTitle = isRouterReady
    ? getSingleQueryParam(router.query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM])
    : null;
  const officialJobsRoleSlug = isRouterReady
    ? getSingleQueryParam(router.query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM])
    : null;
  const officialJobsChatDraftSeed = useMemo(() => {
    if (officialJobsSource !== OFFICIAL_JOBS_LANDING_SOURCE) return null;

    const draft = buildOfficialJobsInitialChatDraft(
      officialJobsRoleTitle,
      locale
    );
    if (!draft) return null;

    const keySource =
      officialJobsRoleSlug?.trim() || officialJobsRoleTitle?.trim() || draft;
    return {
      draft,
      key: `official_jobs:${locale}:${keySource}`,
    };
  }, [locale, officialJobsRoleSlug, officialJobsRoleTitle, officialJobsSource]);
  const deliveryEmailHistoryLinkEntry = isRouterReady
    ? getSingleQueryParam(router.query[DELIVERY_EMAIL_HISTORY_LINK_ENTRY_PARAM])
    : null;
  const isDeliveryEmailHistoryLinkEntry =
    deliveryEmailHistoryLinkEntry === DELIVERY_EMAIL_HISTORY_LINK_ENTRY_VALUE;
  const referralIntent =
    isRouterReady && getSingleQueryParam(router.query.intent) === "referral";

  const currentActiveTab = useMemo(
    () =>
      isRouterReady ? getCareerWorkspaceTabFromPath(router.asPath) : activeTab,
    [activeTab, isRouterReady, router.asPath]
  );

  const { isOnboardingStatusReady, needsOnboarding } =
    useTalentOnboardingRedirect({
      enabled: !authLoading && isRouterReady && Boolean(user),
      emailOnboardingToken,
      inviteToken,
      mail,
      userId: user?.id ?? null,
    });
  useCareerVisitLog(!authLoading && isRouterReady && Boolean(user));

  useEffect(() => {
    return subscribeCareerReferralModalOpen(() => {
      setSettingsInitialTab("referral");
      setIsSettingsModalOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!isRouterReady || authLoading || !user) return;
    const captureKey = `${user.id}:${router.asPath}`;
    if (referralCaptureKeyRef.current === captureKey) return;
    referralCaptureKeyRef.current = captureKey;

    void supabase.auth
      .getSession()
      .then(({ data }) =>
        captureTalentNetworkReferralFromCurrentLocation({
          accessToken: data.session?.access_token ?? null,
          source: TALENT_NETWORK_REFERRAL_SOURCE_CAREER_PROFILE_MENU,
        })
      )
      .catch((error) => {
        console.warn("[career] referral capture failed:", error);
      });
  }, [authLoading, isRouterReady, router.asPath, user]);

  useEffect(() => {
    if (!isRouterReady || !user || !referralIntent) return;

    window.setTimeout(() => {
      setSettingsInitialTab("referral");
      setIsSettingsModalOpen(true);
    }, 0);

    const nextQuery = { ...router.query };
    delete nextQuery.intent;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [isRouterReady, referralIntent, router, user]);

  useEffect(() => {
    if (
      !isRouterReady ||
      !user ||
      !officialJobsChatDraftSeed ||
      !isOnboardingStatusReady ||
      needsOnboarding
    ) {
      return;
    }
    if (
      router.query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM] === undefined &&
      router.query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM] === undefined
    ) {
      return;
    }

    const nextQuery = { ...router.query };
    delete nextQuery[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM];
    delete nextQuery[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM];
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [
    isOnboardingStatusReady,
    isRouterReady,
    needsOnboarding,
    officialJobsChatDraftSeed,
    router,
    user,
  ]);

  useEffect(() => {
    if (
      authLoading ||
      !isRouterReady ||
      !user ||
      currentActiveTab !== "history" ||
      !isDeliveryEmailHistoryLinkEntry ||
      deliveryEmailHistoryLinkLoggedRef.current
    ) {
      return;
    }

    deliveryEmailHistoryLinkLoggedRef.current = true;
    const historyTab = getSingleQueryParam(router.query.historyTab);
    logCareerEvent(
      DELIVERY_EMAIL_HISTORY_LINK_EVENT,
      historyTab ? { historyTab } : undefined
    );
  }, [
    authLoading,
    currentActiveTab,
    isDeliveryEmailHistoryLinkEntry,
    isRouterReady,
    logCareerEvent,
    router.query.historyTab,
    user,
  ]);

  useEffect(() => {
    if (authLoading || !isRouterReady || user) return;

    void router.replace({
      pathname: "/career_login",
      query: { next: router.asPath || getCareerWorkspaceHref(activeTab) },
    });
  }, [activeTab, authLoading, isRouterReady, router, user]);

  const handleOpenSettings = useCallback(() => {
    logCareerEvent("click_open_settings");
    setSettingsInitialTab(null);
    setIsSettingsModalOpen(true);
  }, [logCareerEvent]);

  const settingsPanelRequested = Boolean(user && requestedPanel === "settings");
  const settingsModalOpen = isSettingsModalOpen || settingsPanelRequested;
  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
    setSettingsInitialTab(null);

    if (!isRouterReady || requestedPanel !== "settings") return;
    const nextQuery = { ...router.query };
    delete nextQuery.panel;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [isRouterReady, requestedPanel, router]);

  const handleChangeTab = useCallback(
    (
      nextTab: CareerWorkspaceTab,
      options?: {
        historyTarget?: {
          historyTab: "new" | "saved" | "archived";
          savedStage?: CareerOpportunitySavedStageFilter;
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
        activeTab={currentActiveTab}
        emailOnboardingToken={emailOnboardingToken}
        initialChatDraft={officialJobsChatDraftSeed?.draft}
        initialChatDraftKey={officialJobsChatDraftSeed?.key}
        inviteToken={inviteToken}
        mail={mail}
        onOpenSettings={handleOpenSettings}
        settingsDataEnabled={
          settingsModalOpen || currentActiveTab === "profile"
        }
      >
        <CareerWorkspaceScreen
          activeTab={currentActiveTab}
          initialMobileChatOpen={Boolean(officialJobsChatDraftSeed)}
          onChangeTab={handleChangeTab}
        />
        <CareerSettingsModal
          initialTab={settingsInitialTab}
          open={settingsModalOpen}
          onClose={handleCloseSettings}
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
