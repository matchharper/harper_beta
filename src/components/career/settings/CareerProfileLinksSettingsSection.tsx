import {
  Cable,
  Check,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useMemo,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import { getCareerLinkLabels } from "@/components/career/constants";
import { MuteButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldLabel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { useGmailIntegration } from "@/hooks/career/useGmailIntegration";
import { useMessages } from "@/i18n/useMessage";
import { formatRelativeTime } from "@/lib/utils";
import { showToast } from "@/components/toast/toast";
import TalentCareerModal from "@/components/common/TalentCareerModal";

const CAREER_LINK_ITEMS = [
  {
    alt: "LinkedIn",
    iconSrc: "/images/logos/linkedin.svg",
    placeholder: "https://linkedin.com/in/username",
  },
  {
    alt: "Github",
    iconSrc: "/images/logos/github.svg",
    placeholder: "https://github.com/username",
  },
  {
    alt: "Google Scholar",
    iconSrc: "/images/logos/scholar.png",
    placeholder: "https://scholar.google.com/citations?user=",
  },
  {
    alt: "Website",
    iconSrc: null,
    placeholder: "https://yourname.com",
  },
  {
    alt: "X.com",
    iconSrc: "/images/logos/xcom.png",
    placeholder: "https://x.com/username",
  },
] as const;

const LINKEDIN_LINK_INDEX = 0;

const LinkItemIcon = ({ index }: { index: number }) => {
  const item = CAREER_LINK_ITEMS[index];

  if (item?.iconSrc) {
    const isLinkedin = index === LINKEDIN_LINK_INDEX;

    return (
      <Image
        src={item.iconSrc}
        alt={item.alt}
        width={isLinkedin ? 19 : 16}
        height={isLinkedin ? 19 : 16}
        className={
          isLinkedin
            ? "h-[19px] w-[19px] rounded-[4px] object-contain"
            : "h-4 w-4 rounded-[4px] object-contain"
        }
      />
    );
  }

  return <Globe2 className="h-4 w-4 text-neutral-muted" aria-hidden="true" />;
};

type CareerProfileLinksSettingsSectionProps = {
  hasUnsavedChanges: boolean;
  onLinkedinRefresh: () => void;
  onSave: () => void;
};

const COLLAPSED_LINK_FIELD_HEIGHT = 36;

const resizeLinkField = (element: HTMLTextAreaElement, expanded: boolean) => {
  element.style.height = `${COLLAPSED_LINK_FIELD_HEIGHT}px`;
  if (!expanded) return;

  element.style.height = "auto";
  element.style.height = `${Math.max(
    COLLAPSED_LINK_FIELD_HEIGHT,
    element.scrollHeight
  )}px`;
};

type ExpandingLinkFieldProps = {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

const ExpandingLinkField = ({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: ExpandingLinkFieldProps) => {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const normalizedValue = event.currentTarget.value.replace(/[\r\n]+/g, "");
    event.currentTarget.value = normalizedValue;
    onChange(normalizedValue);
    resizeLinkField(event.currentTarget, true);
  };

  const handleFocus = (event: FocusEvent<HTMLTextAreaElement>) => {
    resizeLinkField(event.currentTarget, true);
  };

  const handleBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    resizeLinkField(event.currentTarget, false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  };

  return (
    <Textarea
      rows={1}
      value={value}
      disabled={disabled}
      inputMode="url"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      aria-label={label}
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="h-9 min-h-9 overflow-hidden px-2 py-2 text-sm leading-5 [overflow-wrap:anywhere] transition-[height,border-color,background-color]"
    />
  );
};

const CareerProfileLinksSettingsSection = ({
  hasUnsavedChanges,
  onLinkedinRefresh,
  onSave,
}: CareerProfileLinksSettingsSectionProps) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const careerLinkLabels = useMemo(() => getCareerLinkLabels(t), [t]);
  const logCareerEvent = useCareerLogEvent();
  const gmailIntegration = useGmailIntegration();
  const [gmailResyncConfirmOpen, setGmailResyncConfirmOpen] = useState(false);
  const {
    profileLinks,
    profileSavePending,
    onProfileLinkChange,
    onAddProfileLink,
    onRemoveProfileLink,
  } = useCareerProfileContext();

  const handleGmailConnect = async () => {
    logCareerEvent("click_resume_links_connect_gmail");
    try {
      await gmailIntegration.connect();
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
    setGmailResyncConfirmOpen(false);
    logCareerEvent("click_resume_links_analyze_gmail");
    try {
      await gmailIntegration.analyze();
      showToast({
        message: t(
          "career.profile.resume_links.gmail_analysis_queued_toast",
          "Gmail 커리어 이력 분석을 시작했습니다. 완료되면 내 문서에 추가됩니다."
        ),
        variant: "white",
      });
    } catch {
      showToast({
        message: t(
          "career.profile.resume_links.gmail_analysis_failed",
          "Gmail 커리어 이력 분석을 시작하지 못했습니다. 다시 시도해 주세요."
        ),
        variant: "error",
      });
    }
  };

  const handleGmailAnalyzeClick = () => {
    if (gmailIntegration.analysisStatus === "completed") {
      setGmailResyncConfirmOpen(true);
      return;
    }
    void handleGmailAnalyze();
  };

  return (
    <div>
      <FieldLabel
        icon={<Cable className="h-4 w-4" />}
        label={t("career.common.career.1ominm4", "내 링크")}
      />
      <div className="mt-2 space-y-2">
        {profileLinks.map((link, index) => (
          <div
            key={`settings-profile-link-${index}`}
            className="grid gap-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start sm:gap-2"
          >
            <div className="flex min-h-9 w-full items-center justify-between gap-2 text-sm text-neutral-muted sm:w-36">
              <div className="flex items-center gap-1">
                <LinkItemIcon index={index} />
                <span className="truncate">
                  {careerLinkLabels[index] ??
                    t(
                      "career.chat.career_timeline_section.0ong27a",
                      "추가 링크"
                    )}
                </span>
              </div>
              {index === LINKEDIN_LINK_INDEX ? (
                <Tooltips
                  text={t(
                    "career.profile.resume_links.linkedin_refresh_tooltip",
                    "업데이트된 링크드인 정보를 가져옵니다."
                  )}
                  side="top"
                >
                  <MuteButton
                    type="button"
                    onClick={onLinkedinRefresh}
                    disabled={profileSavePending}
                    aria-label={t(
                      "career.profile.resume_links.linkedin_refresh_label",
                      "링크드인 정보 새로고침"
                    )}
                    variant="neutral"
                    size="sm"
                  >
                    {profileSavePending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </MuteButton>
                </Tooltips>
              ) : null}
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <ExpandingLinkField
                value={link}
                onChange={(value) => onProfileLinkChange(index, value)}
                placeholder={
                  CAREER_LINK_ITEMS[index]?.placeholder ?? "https://"
                }
                label={
                  careerLinkLabels[index] ??
                  t("career.chat.career_timeline_section.0ong27a", "추가 링크")
                }
                disabled={profileSavePending}
              />
              {index >= CAREER_LINK_ITEMS.length ? (
                <MuteButton
                  type="button"
                  onClick={() => {
                    logCareerEvent("click_resume_links_remove_link");
                    onRemoveProfileLink(index);
                  }}
                  disabled={profileSavePending}
                  aria-label={t(
                    "career.settings.career_resume_links_settings_section.114mcb5",
                    "링크 삭제"
                  )}
                >
                  <X className="h-4 w-4" />
                </MuteButton>
              ) : null}
            </div>
          </div>
        ))}
        <div className="grid gap-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-2">
          <div className="flex min-h-9 w-full items-center gap-1 text-sm text-neutral-muted sm:w-36">
            <Image
              src="/images/logos/gmail.svg"
              alt="Gmail"
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
            />
            <span className="truncate">Gmail</span>
          </div>
          <div className="flex min-h-9 items-center">
            {gmailIntegration.status === "loading" ? (
              <span
                className="inline-flex items-center gap-2 text-sm text-neutral-muted"
                aria-label={t(
                  "career.profile.resume_links.gmail_status_loading",
                  "Gmail 연결 상태 확인 중"
                )}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
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
              <div className="flex flex-wrap items-center gap-2">
                <Badge icon={<Check />} tone="positive" variant="faded">
                  {t("career.profile.resume_links.gmail_connected", "연결됨")}
                </Badge>
                <MuteButton
                  type="button"
                  size="sm"
                  variant="transparent"
                  disabled={gmailIntegration.pendingAction !== null}
                  onClick={handleGmailAnalyzeClick}
                >
                  {gmailIntegration.pendingAction === "analyze" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : gmailIntegration.analysisStatus === "completed" ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : null}
                  {gmailIntegration.analysisStatus === "completed"
                    ? t("career.profile.resume_links.gmail_resync", "새로고침")
                    : t(
                        "career.profile.resume_links.gmail_analyze",
                        "커리어 이력 분석"
                      )}
                </MuteButton>
                {gmailIntegration.analysisStatus === "completed" &&
                gmailIntegration.analysisUpdatedAt ? (
                  <span className="text-xs text-neutral-soft">
                    {t(
                      "career.profile.resume_links.gmail_last_synced",
                      "마지막 업데이트 {time}"
                    ).replace(
                      "{time}",
                      formatRelativeTime(
                        gmailIntegration.analysisUpdatedAt,
                        locale
                      ) ?? ""
                    )}
                  </span>
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
                  {t(
                    "career.profile.resume_links.gmail_disconnect",
                    "연결 해제"
                  )}
                </MuteButton>
              </div>
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
                disabled={gmailIntegration.pendingAction !== null}
                onClick={() => void handleGmailConnect()}
              >
                {gmailIntegration.pendingAction === "connect" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {gmailIntegration.status === "expired"
                  ? t(
                      "career.profile.resume_links.gmail_reconnect",
                      "다시 연결"
                    )
                  : t("career.profile.resume_links.gmail_connect", "연결")}
              </MuteButton>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <MuteButton
          onClick={() => {
            logCareerEvent("click_resume_links_add_link");
            onAddProfileLink();
          }}
          disabled={profileSavePending}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("career.chat.career_timeline_section.1gvzqes", "링크 추가")}
        </MuteButton>
        {hasUnsavedChanges ? (
          <MuteButton
            type="button"
            variant="dark"
            onClick={onSave}
            disabled={profileSavePending}
          >
            {profileSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {profileSavePending
              ? t(
                  "career.profile.career_profile_settings_section.08zy6at",
                  "저장 중..."
                )
              : t(
                  "career.profile.career_talent_profile_panel.0x4dx7a",
                  "저장하기"
                )}
          </MuteButton>
        ) : null}
      </div>

      <TalentCareerModal
        open={gmailResyncConfirmOpen}
        onClose={() => {
          if (gmailIntegration.pendingAction !== "analyze") {
            setGmailResyncConfirmOpen(false);
          }
        }}
        closeOnBackdrop={gmailIntegration.pendingAction !== "analyze"}
        title={t(
          "career.profile.resume_links.gmail_resync_confirm_title",
          "Gmail 커리어 이력을 새로 분석할까요?"
        )}
        description={t(
          "career.profile.resume_links.gmail_resync_confirm_description",
          "현재 문서에서 직접 수정한 내용도 새 분석 결과로 대체됩니다."
        )}
        panelClassName="max-w-[480px] bg-bg-floating"
        bodyClassName="px-5 py-5"
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton
              onClick={() => setGmailResyncConfirmOpen(false)}
              disabled={gmailIntegration.pendingAction === "analyze"}
            >
              {t("career.common.cancel", "취소")}
            </MuteButton>
            <MuteButton
              variant="warn"
              onClick={() => void handleGmailAnalyze()}
              disabled={gmailIntegration.pendingAction === "analyze"}
            >
              {gmailIntegration.pendingAction === "analyze" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {t(
                "career.profile.resume_links.gmail_resync_confirm_action",
                "새로 분석"
              )}
            </MuteButton>
          </div>
        }
      >
        <p className="text-sm leading-6 text-neutral-muted">
          {t(
            "career.profile.resume_links.gmail_resync_confirm_help",
            "저장된 Gmail 커리어 이력 문서는 유지되지만 내용은 새 분석 결과로 덮어씁니다."
          )}
        </p>
      </TalentCareerModal>
    </div>
  );
};

export default CareerProfileLinksSettingsSection;
