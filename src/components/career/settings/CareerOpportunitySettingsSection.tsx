import { useState } from "react";
import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { AppleSwitch } from "@/components/ui/switch";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import {
  getAccountSubscriptionConfirmationKind,
  toAccountSubscriptionSettings,
  type AccountSubscriptionConfirmationKind,
  type AccountSubscriptionSettings,
} from "@/lib/career/accountSubscriptions";
import { useCareerProfileContext } from "../CareerSidebarContext";
import type { CareerTalentPreferences } from "../types";
import { CareerSettingRow as SettingRow } from "./CareerSettingRow";

type AccountSubscriptionsPayload = {
  accountSubscriptions?: AccountSubscriptionSettings;
  error?: string;
  preferences?: CareerTalentPreferences;
  preferencesUpdatedAt?: string | null;
};

export default function CareerOpportunitySettingsSection() {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const {
    profileVisibility,
    talentPreferences,
    settingsLoading,
    settingsSaving,
    onAccountSubscriptionsUpdated,
  } = useCareerProfileContext();
  const subscriptionSettings = toAccountSubscriptionSettings({
    getExternalRecommendation:
      talentPreferences?.getExternalRecommendation ?? true,
    profileVisibility,
  });
  const receivingOpportunities =
    subscriptionSettings.harperEnabled ||
    subscriptionSettings.getExternalRecommendation;
  const [subscriptionPending, setSubscriptionPending] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState("");
  const [subscriptionConfirmKind, setSubscriptionConfirmKind] =
    useState<AccountSubscriptionConfirmationKind | null>(null);
  const [pendingSubscriptionSettings, setPendingSubscriptionSettings] =
    useState<AccountSubscriptionSettings | null>(null);

  const subscriptionConfirmCopy =
    subscriptionConfirmKind === "pause_all"
      ? {
          cancel: t(
            "career.settings.career_settings_modal.pause_cancel",
            "계속 받기"
          ),
          closeAria: t(
            "career.settings.career_settings_modal.pause_close_aria",
            "새 기회 수신 중지 확인 닫기"
          ),
          confirm: t(
            "career.settings.career_settings_modal.pause_confirm",
            "수신 중지"
          ),
          description: t(
            "career.settings.career_settings_modal.pause_description",
            "새 기회 추천과 Harper 연결 소식을 멈춰요. 계정과 프로필, 자료, 대화 기록은 유지되며 언제든 다시 켤 수 있어요."
          ),
          title: t(
            "career.settings.career_settings_modal.pause_title",
            "새 기회 받기를 멈출까요?"
          ),
        }
      : {
          cancel: t(
            "career.settings.career_settings_modal.external_recommendation_off_cancel",
            "계속 받기"
          ),
          closeAria: t(
            "career.settings.career_settings_modal.external_recommendation_off_close_aria",
            "직접 지원 기회 수신 중지 확인 닫기"
          ),
          confirm: t(
            "career.settings.career_settings_modal.external_recommendation_off_confirm",
            "직접 지원 기회 끄기"
          ),
          description: t(
            "career.settings.career_settings_modal.external_recommendation_off_description",
            "직접 지원 기회의 정기 추천을 멈춰요. Harper가 연결하는 기회는 계속 받을 수 있어요."
          ),
          title: t(
            "career.settings.career_settings_modal.external_recommendation_off_title",
            "직접 지원 기회 받기를 멈출까요?"
          ),
        };

  const persistAccountSubscriptions = async (
    nextSettings: AccountSubscriptionSettings
  ) => {
    if (subscriptionPending) return false;

    const previousSettings = subscriptionSettings;
    const requestBody = {
      getExternalRecommendation: nextSettings.getExternalRecommendation,
      ...(nextSettings.harperEnabled === previousSettings.harperEnabled
        ? {}
        : { harperEnabled: nextSettings.harperEnabled }),
    };
    setSubscriptionPending(true);
    setSubscriptionError("");

    try {
      const response = await fetchWithAuth("/api/talent/preferences", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as AccountSubscriptionsPayload;

      if (
        !response.ok ||
        !payload.accountSubscriptions ||
        !payload.preferences
      ) {
        throw new Error(
          t(
            "career.settings.career_settings_modal.subscription_update_failed",
            "기회 설정을 저장하지 못했어요. 다시 시도해 주세요."
          )
        );
      }

      onAccountSubscriptionsUpdated({
        harperEnabled: payload.accountSubscriptions.harperEnabled,
        preferences: payload.preferences,
        preferencesUpdatedAt: payload.preferencesUpdatedAt ?? null,
      });
      setSubscriptionConfirmKind(null);
      setPendingSubscriptionSettings(null);
      logCareerEvent("confirm_settings_account_subscriptions_update");
      return true;
    } catch (error) {
      setSubscriptionError(
        error instanceof Error
          ? error.message
          : t(
              "career.settings.career_settings_modal.subscription_update_failed",
              "기회 설정을 저장하지 못했어요. 다시 시도해 주세요."
            )
      );
      return false;
    } finally {
      setSubscriptionPending(false);
    }
  };

  const requestAccountSubscriptionUpdate = (
    nextSettings: AccountSubscriptionSettings
  ) => {
    const confirmationKind = getAccountSubscriptionConfirmationKind({
      current: subscriptionSettings,
      next: nextSettings,
    });
    if (confirmationKind) {
      setSubscriptionError("");
      setPendingSubscriptionSettings(nextSettings);
      setSubscriptionConfirmKind(confirmationKind);
      return;
    }

    void persistAccountSubscriptions(nextSettings);
  };

  const handleHarperEnabledChange = (checked: boolean) => {
    if (subscriptionPending || checked === receivingOpportunities) {
      return;
    }
    logCareerEvent(`click_settings_harper_enabled_${checked ? "on" : "off"}`);

    const nextSettings = {
      getExternalRecommendation: checked,
      harperEnabled: checked,
    };
    requestAccountSubscriptionUpdate(nextSettings);
  };

  const handleExternalRecommendationChange = (checked: boolean) => {
    if (
      subscriptionPending ||
      checked === subscriptionSettings.getExternalRecommendation
    ) {
      return;
    }
    logCareerEvent(
      `click_settings_external_recommendations_${checked ? "on" : "off"}`
    );

    const nextSettings = {
      getExternalRecommendation: checked,
      harperEnabled: subscriptionSettings.harperEnabled,
    };
    requestAccountSubscriptionUpdate(nextSettings);
  };

  return (
    <>
      <div className="divide-y divide-neutral-1000-a05">
        <SettingRow
          mobileActionPlacement="trailing"
          title={t(
            "career.settings.career_settings_modal.harper_enabled_title",
            "새 기회 받기"
          )}
          desc={t(
            "career.settings.career_settings_modal.harper_enabled_description",
            "끄면 계정과 데이터는 유지하고 새 기회와 연결 소식을 멈춰요."
          )}
          action={
            <div className="flex min-h-9 items-center gap-2 sm:justify-end">
              <AppleSwitch
                checked={receivingOpportunities}
                disabled={
                  subscriptionPending || settingsLoading || settingsSaving
                }
                onCheckedChange={handleHarperEnabledChange}
                aria-label={t(
                  "career.settings.career_settings_modal.harper_enabled_title",
                  "새 기회 받기"
                )}
              />
            </div>
          }
        />

        <SettingRow
          mobileActionPlacement="trailing"
          title={t(
            "career.settings.career_settings_modal.external_recommendation_title",
            "직접 지원 기회도 받기"
          )}
          action={
            <div className="flex min-h-9 items-center gap-2 sm:justify-end">
              <AppleSwitch
                checked={subscriptionSettings.getExternalRecommendation}
                disabled={
                  subscriptionPending || settingsLoading || settingsSaving
                }
                onCheckedChange={handleExternalRecommendationChange}
                aria-label={t(
                  "career.settings.career_settings_modal.external_recommendation_title",
                  "직접 지원 기회도 받기"
                )}
              />
            </div>
          }
        />

        {subscriptionError && subscriptionConfirmKind === null ? (
          <div className="py-4 sm:ml-auto sm:w-[360px]">
            <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
              {subscriptionError}
            </p>
          </div>
        ) : null}
      </div>
      <TalentCareerModal
        open={subscriptionConfirmKind !== null}
        onClose={() => {
          if (subscriptionPending) return;
          setSubscriptionConfirmKind(null);
          setPendingSubscriptionSettings(null);
          setSubscriptionError("");
        }}
        closeOnBackdrop={!subscriptionPending}
        showCloseButton={!subscriptionPending}
        mobileBottomSheet
        closeButtonAriaLabel={subscriptionConfirmCopy.closeAria}
        title={subscriptionConfirmCopy.title}
        description={subscriptionConfirmCopy.description}
        headerClassName="border-b-0"
        panelClassName="max-w-[420px] border-neutral-1000-a10 bg-bg-floating"
        bodyClassName={subscriptionError ? "px-5 pt-5" : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton
              type="button"
              size="md"
              onClick={() => {
                setSubscriptionConfirmKind(null);
                setPendingSubscriptionSettings(null);
                setSubscriptionError("");
              }}
              disabled={subscriptionPending}
            >
              {subscriptionConfirmCopy.cancel}
            </MuteButton>
            <MuteButton
              type="button"
              variant="dark"
              size="md"
              onClick={() => {
                if (!pendingSubscriptionSettings) return;
                void persistAccountSubscriptions(pendingSubscriptionSettings);
              }}
              disabled={subscriptionPending}
            >
              {subscriptionPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {subscriptionPending
                ? t(
                    "career.settings.career_settings_modal.subscription_updating",
                    "변경 중"
                  )
                : subscriptionConfirmCopy.confirm}
            </MuteButton>
          </div>
        }
      >
        {subscriptionError ? (
          <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
            {subscriptionError}
          </p>
        ) : null}
      </TalentCareerModal>
    </>
  );
}
