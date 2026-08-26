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
import { TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE } from "@/lib/career/accountEmailErrors";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { supabase } from "@/lib/supabase";
import { subscribeCareerReferralModalOpen } from "@/components/career/referral/careerReferralEvents";
import {
  captureTalentNetworkReferralFromCurrentLocation,
  TALENT_NETWORK_REFERRAL_SOURCE_CAREER_PROFILE_MENU,
} from "@/lib/talentNetworkReferral";
import {
  buildOfficialJobsInitialChatDraft,
  OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_PARAM,
  OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM,
} from "@/lib/officialJobs";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import { showToast } from "@/components/toast/toast";
import { useCareerT } from "@/i18n/useCareerT";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { notifyGmailIntegrationChanged } from "@/hooks/career/useGmailIntegration";

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
  const t = useCareerT();
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<CareerSettingsTab | null>(null);
  const deliveryEmailHistoryLinkLoggedRef = useRef(false);
  const referralCaptureKeyRef = useRef("");
  const gmailCallbackHandledRef = useRef("");
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
  const requestedSettingsTab =
    isRouterReady &&
    (router.query.settingsTab === "profile" ||
      router.query.settingsTab === "resume" ||
      router.query.settingsTab === "referral" ||
      router.query.settingsTab === "account")
      ? router.query.settingsTab
      : null;
  const emailChangeResult = isRouterReady
    ? getSingleQueryParam(router.query.emailChange)
    : null;
  const gmailConnectCallback = isRouterReady
    ? getSingleQueryParam(router.query.gmailConnect)
    : null;
  const gmailConnectStatus = isRouterReady
    ? getSingleQueryParam(router.query.status)
    : null;
  const gmailConnectedAccountId = isRouterReady
    ? getSingleQueryParam(router.query.connected_account_id)
    : null;
  const officialJobsSource = isRouterReady
    ? getSingleQueryParam(router.query.source)
    : null;
  const officialJobsRoleTitle = isRouterReady
    ? getSingleQueryParam(router.query[OFFICIAL_JOBS_ONBOARDING_JOB_PARAM])
    : null;
  const officialJobsCompanyName = isRouterReady
    ? getSingleQueryParam(router.query[OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM])
    : null;
  const officialJobsRoleSlug = isRouterReady
    ? getSingleQueryParam(router.query[OFFICIAL_JOBS_ONBOARDING_JOB_SLUG_PARAM])
    : null;
  const officialJobsChatDraftSeed = useMemo(() => {
    if (officialJobsSource !== OFFICIAL_JOBS_LANDING_SOURCE) return null;

    const draft = buildOfficialJobsInitialChatDraft(
      officialJobsRoleTitle,
      officialJobsCompanyName,
      locale
    );
    if (!draft) return null;

    const keySource =
      officialJobsRoleSlug?.trim() ||
      [officialJobsRoleTitle?.trim(), officialJobsCompanyName?.trim()]
        .filter(Boolean)
        .join(":") ||
      draft;
    return {
      draft,
      key: `official_jobs:${locale}:${keySource}`,
    };
  }, [
    locale,
    officialJobsCompanyName,
    officialJobsRoleSlug,
    officialJobsRoleTitle,
    officialJobsSource,
  ]);
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
    if (!isRouterReady || !emailChangeResult) return;

    if (emailChangeResult === "complete") {
      showToast({
        message: t(
          "career.settings.email_change.completed",
          "인증된 이메일로 변경했습니다."
        ),
        variant: "white",
      });
    } else if (emailChangeResult === "pending") {
      showToast({
        message: t(
          "career.settings.email_change.still_pending",
          "새 이메일로 받은 인증 링크를 확인해주세요."
        ),
        variant: "white",
      });
    } else if (emailChangeResult === "unavailable") {
      showToast({
        message: t(
          "career.settings.email_change.in_use",
          TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE
        ),
        variant: "error",
      });
    } else if (emailChangeResult === "expired") {
      showToast({
        message: t(
          "career.settings.email_change.link_expired",
          "이 링크는 만료되었거나 재발송으로 교체되었습니다. 가장 최근에 받은 인증 메일을 열어주세요."
        ),
        variant: "error",
      });
    } else {
      showToast({
        message: t(
          "career.settings.email_change.callback_failed",
          "인증된 이메일을 저장하지 못했습니다. 다시 시도해 주세요."
        ),
        variant: "error",
      });
    }

    const nextQuery = { ...router.query };
    delete nextQuery.emailChange;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [emailChangeResult, isRouterReady, router, t]);

  useEffect(() => {
    if (
      !isRouterReady ||
      authLoading ||
      !user ||
      gmailConnectCallback !== "callback"
    ) {
      return;
    }

    const callbackKey = `${gmailConnectStatus ?? ""}:${
      gmailConnectedAccountId ?? ""
    }`;
    if (gmailCallbackHandledRef.current === callbackKey) return;
    gmailCallbackHandledRef.current = callbackKey;

    const clearCallbackQuery = () => {
      const nextQuery = { ...router.query };
      delete nextQuery.connected_account_id;
      delete nextQuery.gmailConnect;
      delete nextQuery.status;
      void router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true, scroll: false }
      );
    };

    const completeConnection = async () => {
      if (gmailConnectStatus !== "success" || !gmailConnectedAccountId) {
        throw new Error("Gmail connection callback was not successful");
      }
      await fetchWithInternalAuth("/api/talent/integrations/gmail/complete", {
        body: JSON.stringify({
          connectedAccountId: gmailConnectedAccountId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    };

    void completeConnection()
      .then(() => {
        notifyGmailIntegrationChanged();
        showToast({
          message: t(
            "career.profile.resume_links.gmail_connected_toast",
            "Gmail을 연결했습니다. 이제 Harper가 요청할 때 이메일을 조회할 수 있습니다."
          ),
          variant: "success",
        });
      })
      .catch(() => {
        showToast({
          message: t(
            "career.profile.resume_links.gmail_callback_failed",
            "Gmail 연결을 완료하지 못했습니다. 다시 시도해 주세요."
          ),
          variant: "error",
        });
      })
      .finally(clearCallbackQuery);
  }, [
    authLoading,
    gmailConnectCallback,
    gmailConnectedAccountId,
    gmailConnectStatus,
    isRouterReady,
    router,
    t,
    user,
  ]);

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
    delete nextQuery[OFFICIAL_JOBS_ONBOARDING_COMPANY_PARAM];
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
          roleId?: string;
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
        if (historyTarget.roleId) {
          query.id = historyTarget.roleId;
        }
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
          initialTab={
            settingsInitialTab ??
            (settingsPanelRequested ? requestedSettingsTab : null)
          }
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
