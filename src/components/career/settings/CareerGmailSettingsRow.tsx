import { Loader2, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { showToast } from "@/components/toast/toast";
import { MuteButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import {
  GMAIL_CONNECTION_SUCCESS_QUERY_PARAM,
  isGmailCareerHistoryAnalysisRunning,
  useGmailIntegration,
} from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
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

  const setGmailConnectionSuccessModalOpen = (open: boolean) => {
    const nextQuery = { ...router.query };
    if (open) {
      nextQuery[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM] = "success";
    } else {
      delete nextQuery[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM];
    }
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
        setGmailConnectionSuccessModalOpen(true);
      }
    } catch {
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
          "Gmail 이메일 읽어오기를 시작했습니다. 완료되면 내 문서에 추가됩니다."
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

  const handleGmailConnectionSuccessClose = () => {
    if (gmailIntegration.pendingAction === "analyze") return;
    logCareerEvent("close_resume_links_gmail_connected");
    setGmailConnectionSuccessModalOpen(false);
  };

  const handleGmailConnectionSuccessImport = async () => {
    logCareerEvent("import_resume_links_gmail_connected");
    const started = await handleGmailAnalyze();
    if (started) {
      setGmailConnectionSuccessModalOpen(false);
    }
  };

  return (
    <>
      <div
        aria-live="polite"
        className="grid gap-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start sm:gap-2"
      >
        <div className="flex min-h-9 w-full items-center gap-1 text-sm text-neutral-muted sm:w-36">
          <Image
            src="/images/logos/gmail.svg"
            alt=""
            width={16}
            height={16}
            className="h-4 w-4 rounded-[4px] object-contain"
          />
          <span className="truncate">Gmail</span>
        </div>

        <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2">
          {gmailIntegration.status === "active" ? (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                gmailAnalysisRunning
                  ? "bg-action-faded text-action"
                  : gmailIntegration.analysisStatus === "failed"
                    ? "bg-critical-faded text-critical"
                    : "bg-positive-faded text-positive"
              }`}
            >
              {gmailAnalysisRunning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              {gmailAnalysisRunning
                ? t(
                    "career.profile.resume_links.gmail_analysis_running",
                    "읽어오는 중"
                  )
                : gmailIntegration.analysisStatus === "failed"
                  ? t(
                      "career.profile.resume_links.gmail_analysis_failed_status",
                      "읽어오기 실패"
                    )
                  : t("career.profile.resume_links.gmail_connected", "연결됨")}
            </span>
          ) : null}

          {gmailIntegration.status === "loading" ? (
            <MuteButton
              type="button"
              size="sm"
              disabled
              aria-label={t(
                "career.profile.resume_links.gmail_status_loading",
                "Gmail 연결 상태 확인 중"
              )}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("career.profile.resume_links.gmail_connect", "연동하기")}
            </MuteButton>
          ) : gmailIntegration.status === "error" ? (
            <MuteButton
              type="button"
              size="sm"
              onClick={() => void handleGmailStatusRetry()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t(
                "career.profile.resume_links.gmail_status_retry",
                "상태 다시 확인"
              )}
            </MuteButton>
          ) : gmailIntegration.status === "active" ? (
            <>
              {!gmailIntegration.analysisUpdatedAt ? (
                <MuteButton
                  type="button"
                  size="sm"
                  variant="dark"
                  disabled={
                    gmailIntegration.pendingAction !== null ||
                    gmailAnalysisRunning
                  }
                  onClick={() => void handleGmailAnalyze()}
                >
                  {gmailIntegration.pendingAction === "analyze" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {t("career.profile.resume_links.gmail_analyze", "읽어오기")}
                </MuteButton>
              ) : null}
              <MuteButton
                type="button"
                size="sm"
                variant="transparent"
                disabled={gmailIntegration.pendingAction !== null}
                onClick={() => void handleGmailDisconnect()}
              >
                {gmailIntegration.pendingAction === "disconnect" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("career.profile.resume_links.gmail_disconnect", "연결 해제")}
              </MuteButton>
            </>
          ) : gmailIntegration.status === "disabled" ? (
            <MuteButton
              type="button"
              size="sm"
              variant="warn"
              disabled={gmailIntegration.pendingAction !== null}
              onClick={() => void handleGmailDisconnect()}
            >
              {gmailIntegration.pendingAction === "disconnect" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t(
                "career.profile.resume_links.gmail_disconnect_retry",
                "연결 해제 재시도"
              )}
            </MuteButton>
          ) : (
            <MuteButton
              type="button"
              size="sm"
              variant="dark"
              disabled={gmailIntegration.pendingAction !== null}
              onClick={() => void handleGmailConnect()}
            >
              {gmailIntegration.pendingAction === "connect" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {gmailIntegration.status === "expired"
                ? t("career.profile.resume_links.gmail_reconnect", "다시 연결")
                : t("career.profile.resume_links.gmail_connect", "연동하기")}
            </MuteButton>
          )}
        </div>
      </div>

      <GmailConnectionSuccessModal
        open={gmailConnectionSucceeded}
        pending={gmailIntegration.pendingAction === "analyze"}
        onClose={handleGmailConnectionSuccessClose}
        onImport={() => void handleGmailConnectionSuccessImport()}
      />
    </>
  );
};

export default CareerGmailSettingsRow;
