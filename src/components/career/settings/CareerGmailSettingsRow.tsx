import { Ellipsis, Loader2, MailSearch, RefreshCw, Unplug } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { showToast } from "@/components/toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import {
  GMAIL_CONNECTION_SUCCESS_QUERY_PARAM,
  isGmailCareerHistoryAnalysisRunning,
  useGmailIntegration,
} from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
import CareerProfileSourceCard from "./CareerProfileSourceCard";
import GmailConnectionSuccessModal from "./GmailConnectionSuccessModal";

const CareerGmailSettingsRow = () => {
  const t = useCareerT();
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { user } = useCareerProfileContext();
  const gmailIntegration = useGmailIntegration(user?.id ?? null);
  const gmailConnectionSucceeded =
    router.isReady &&
    router.query[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM] === "success";
  const gmailAnalysisRunning =
    gmailIntegration.pendingAction === "analyze" ||
    isGmailCareerHistoryAnalysisRunning(gmailIntegration.analysisStatus);
  const connected = gmailIntegration.status === "active";
  const busy = gmailIntegration.pendingAction !== null || gmailAnalysisRunning;
  const showPrimaryConnectAction =
    gmailIntegration.status === "not_connected" ||
    gmailIntegration.status === "expired";

  const setGmailConnectionSuccessModalOpen = (open: boolean) => {
    const nextQuery = { ...router.query };
    if (open) nextQuery[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM] = "success";
    else delete nextQuery[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM];
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  const handleGmailConnect = async () => {
    logCareerEvent("click_resume_links_connect_gmail");
    try {
      const result = await gmailIntegration.connect();
      if (result?.connected) {
        logCareerEvent("gmail_connect_succeeded");
        setGmailConnectionSuccessModalOpen(true);
      }
    } catch {
      logCareerEvent("gmail_connect_failed");
      showToast({
        message: t(
          "career.profile.resume_links.gmail_connect_failed",
          "Gmail 연결을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."
        ),
        variant: "error",
      });
    }
  };

  const handleGmailDisconnect = async () => {
    logCareerEvent("click_resume_links_disconnect_gmail");
    try {
      await gmailIntegration.disconnect();
      showToast({
        message: t(
          "career.profile.resume_links.gmail_disconnected_toast",
          "Gmail 연결을 해제했습니다."
        ),
        variant: "white",
      });
    } catch {
      showToast({
        message: t(
          "career.profile.resume_links.gmail_disconnect_failed",
          "Gmail 연결을 완전히 해제하지 못했습니다. 다시 시도해 주세요."
        ),
        variant: "error",
      });
    }
  };

  const handleGmailStatusRetry = async () => {
    try {
      await gmailIntegration.refresh();
    } catch {
      showToast({
        message: t(
          "career.profile.resume_links.gmail_status_failed",
          "Gmail 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요."
        ),
        variant: "error",
      });
    }
  };

  const handleGmailAnalyze = async () => {
    logCareerEvent("click_resume_links_analyze_gmail");
    try {
      await gmailIntegration.analyze();
      showToast({
        message: t(
          "career.profile.resume_links.gmail_analysis_queued_toast",
          "Gmail 이메일 읽어오기를 시작했습니다. 완료되면 Harper가 확인된 커리어 맥락을 기억합니다."
        ),
        variant: "white",
      });
      return true;
    } catch {
      showToast({
        message: t(
          "career.profile.resume_links.gmail_analysis_failed",
          "Gmail 이메일 읽어오기를 시작하지 못했습니다. 다시 시도해 주세요."
        ),
        variant: "error",
      });
      return false;
    }
  };

  const activate = () => {
    if (busy || gmailIntegration.status === "loading") return;
    if (gmailIntegration.status === "error") {
      void handleGmailStatusRetry();
      return;
    }
    if (connected) {
      void handleGmailAnalyze();
      return;
    }
    if (gmailIntegration.status === "disabled") {
      void handleGmailDisconnect();
      return;
    }
    void handleGmailConnect();
  };

  const statusText = gmailAnalysisRunning
    ? t("career.profile.resume_links.gmail_analysis_running", "읽어오는 중")
    : gmailIntegration.analysisStatus === "failed"
      ? t(
          "career.profile.resume_links.gmail_analysis_failed_status",
          "읽어오기 실패"
        )
      : connected
        ? t("career.profile.resume_links.gmail_connected", "연결됨")
        : gmailIntegration.status === "error"
          ? t(
              "career.profile.resume_links.gmail_status_retry",
              "상태 다시 확인"
            )
          : gmailIntegration.status === "disabled"
            ? t(
                "career.profile.resume_links.gmail_disconnect_retry",
                "연결 해제 재시도"
              )
            : gmailIntegration.status === "expired"
              ? t("career.profile.resume_links.gmail_reconnect", "다시 연결")
              : t("career.profile.resume_links.gmail_connect", "연동하기");

  return (
    <>
      <CareerProfileSourceCard
        icon={
          gmailAnalysisRunning || gmailIntegration.status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Image
              src="/images/logos/gmail.svg"
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] object-contain"
            />
          )
        }
        title="Gmail"
        meta={showPrimaryConnectAction ? null : statusText}
        muted={false}
        className={
          showPrimaryConnectAction
            ? "border-primary/20 bg-primary-faded hover:border-primary/30 hover:bg-primary-faded"
            : undefined
        }
        badge={
          connected ? (
            <Badge size="sm" tone="positive" variant="faded">
              {t("career.profile.sources.connected", "연동")}
            </Badge>
          ) : showPrimaryConnectAction ? (
            <span className="inline-flex rounded-[6px] bg-primary px-2 py-1 text-[11px] font-medium leading-none text-neutral-00">
              {statusText}
            </span>
          ) : null
        }
        onActivate={activate}
        ariaLabel={`Gmail ${statusText}`}
        action={
          connected ? (
            <ActionDropdown
              align="start"
              trigger={
                <MuteButton
                  type="button"
                  size="sm"
                  variant="transparent"
                  disabled={busy}
                  aria-label={t(
                    "career.profile.sources.gmail_actions",
                    "Gmail 메뉴"
                  )}
                  className="h-7 min-h-7 w-7 px-0"
                >
                  <Ellipsis className="h-4 w-4" />
                </MuteButton>
              }
            >
              <ActionDropdownItem onSelect={() => void handleGmailAnalyze()}>
                <MailSearch className="h-4 w-4" />
                {t("career.profile.resume_links.gmail_analyze", "읽어오기")}
              </ActionDropdownItem>
              <ActionDropdownItem
                tone="danger"
                onSelect={() => void handleGmailDisconnect()}
              >
                <Unplug className="h-4 w-4" />
                {t("career.profile.resume_links.gmail_disconnect", "연결 해제")}
              </ActionDropdownItem>
            </ActionDropdown>
          ) : gmailIntegration.status === "error" ? (
            <RefreshCw className="m-1.5 h-3.5 w-3.5" aria-hidden="true" />
          ) : null
        }
      />

      <GmailConnectionSuccessModal
        open={gmailConnectionSucceeded}
        pending={gmailIntegration.pendingAction === "analyze"}
        onClose={() => {
          if (gmailIntegration.pendingAction === "analyze") return;
          logCareerEvent("close_resume_links_gmail_connected");
          setGmailConnectionSuccessModalOpen(false);
        }}
        onImport={() => {
          logCareerEvent("import_resume_links_gmail_connected");
          void handleGmailAnalyze().then((started) => {
            if (started) setGmailConnectionSuccessModalOpen(false);
          });
        }}
      />
    </>
  );
};

export default CareerGmailSettingsRow;
