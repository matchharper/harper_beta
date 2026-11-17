import { Ellipsis, Loader2, RefreshCw, Unplug } from "lucide-react";
import Image from "next/image";
import GmailPermissionsModal from "./GmailPermissionsModal";
import { useRouter } from "next/router";
import { showToast } from "@/components/toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import {
  GMAIL_CONNECTION_SUCCESS_QUERY_PARAM,
  useGmailIntegration,
} from "@/hooks/career/useGmailIntegration";
import { useCareerT } from "@/i18n/useCareerT";
import CareerProfileSourceCard from "./CareerProfileSourceCard";
import GmailIntegrationOverview from "../integrations/GmailIntegrationOverview";

const CareerGmailSettingsRow = () => {
  const t = useCareerT();
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const { user, conversationId } = useCareerSidebarContext();
  const gmailIntegration = useGmailIntegration(user?.id ?? null);
  const overviewOpen = router.isReady && router.query.integration === "gmail";
  const closeOverview = () => {
    const query = { ...router.query };
    delete query.integration;
    void router.replace(
      { pathname: router.pathname, query },
      undefined,
      { shallow: true, scroll: false }
    );
  };
  const permissionsRequired =
    gmailIntegration.status === "permissions_required";
  const permissionsModalOpen =
    router.isReady &&
    router.query[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM] === "permissions";
  const setPermissionsModalOpen = (open: boolean) => {
    const query = { ...router.query };
    if (open) query[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM] = "permissions";
    else delete query[GMAIL_CONNECTION_SUCCESS_QUERY_PARAM];
    delete query.integration;
    void router.replace({ pathname: router.pathname, query }, undefined, {
      shallow: true, scroll: false,
    });
  };
  const connected = gmailIntegration.status === "active";
  const busy = gmailIntegration.pendingAction !== null;
  const showPrimaryConnectAction =
    gmailIntegration.status === "not_connected" ||
    gmailIntegration.status === "expired";

  const handleGmailConnect = async () => {
    logCareerEvent("click_resume_links_connect_gmail");
    try {
      const result = await gmailIntegration.connect({ conversationId });
      if (result?.connected) {
        logCareerEvent("gmail_connect_succeeded");
        setPermissionsModalOpen(false);
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

  const activate = () => {
    if (busy || gmailIntegration.status === "loading") return;
    if (gmailIntegration.status === "error") {
      void handleGmailStatusRetry();
      return;
    }
    if (permissionsRequired) {
      setPermissionsModalOpen(true);
      return;
    }
    if (gmailIntegration.status === "disabled") {
      void handleGmailDisconnect();
      return;
    }
    void handleGmailConnect();
  };

  const statusText = permissionsRequired
    ? t("career.profile.resume_links.gmail_permissions_required", "권한 필요")
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
          gmailIntegration.status === "loading" || busy ? (
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
        meta={
          showPrimaryConnectAction || permissionsRequired || connected ? null : statusText
        }
        muted={false}
        className={
          showPrimaryConnectAction
            ? "border-primary/20 bg-primary-faded hover:border-primary/30 hover:bg-primary-faded"
            : undefined
        }
        badge={
          permissionsRequired ? (
            <Badge size="sm" tone="warning" variant="faded">
              {t(
                "career.profile.resume_links.gmail_permissions_required",
                "권한 필요"
              )}
            </Badge>
          ) : connected ? (
            <Badge size="sm" tone="positive" variant="faded">
              {statusText}
            </Badge>
          ) : showPrimaryConnectAction ? (
            <span className="inline-flex rounded-md bg-primary px-2 py-1 text-[11px] font-medium leading-none text-neutral-00">
              {statusText}
            </span>
          ) : null
        }
        onActivate={connected || busy || gmailIntegration.status === "loading" ? undefined : activate}
        ariaLabel={`Gmail ${statusText}`}
        action={
          connected || permissionsRequired ? (
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

      <GmailIntegrationOverview
        open={
          overviewOpen && !connected && !permissionsModalOpen
        }
        pending={busy || gmailIntegration.status === "loading"}
        onClose={closeOverview}
        onContinue={() => {
          if (!busy && gmailIntegration.status !== "loading")
            void handleGmailConnect();
        }}
      />

      <GmailPermissionsModal
        open={permissionsModalOpen}
        busy={busy}
        onClose={() => {
          if (!busy) setPermissionsModalOpen(false);
        }}
        onContinue={() => void handleGmailConnect()}
      />

    </>
  );
};

export default CareerGmailSettingsRow;
