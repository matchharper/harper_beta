import React from "react";
import { Mail, Phone, UserRound } from "lucide-react";
import type { CareerTalentUser } from "../types";
import { BareButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

const personalInfoFieldClassName = "text-left";

const PersonalInfoLabel = ({ label }: { label: string }) => (
  <span className="flex items-center gap-1.5 text-[12px] font-medium leading-5 text-neutral-muted">
    {label}
  </span>
);

const PersonalInfoValue = ({ value }: { value?: string | null }) => (
  <span
    className={cn(
      "mt-1 block truncate text-[14px] leading-5",
      value ? "text-neutral-primary" : "text-neutral-soft"
    )}
  >
    {value?.trim() || "—"}
  </span>
);

const CareerProfilePersonalInfo = ({
  isEditing,
  onEdit,
  onFieldChange,
  onOpenEmailChangeModal,
  onOpenPhoneNumberModal,
  user,
}: {
  isEditing: boolean;
  onEdit: () => void;
  onFieldChange: (field: "name", value: string) => void;
  onOpenEmailChangeModal: () => void;
  onOpenPhoneNumberModal: () => void;
  user: CareerTalentUser | null | undefined;
}) => {
  const t = useCareerT();
  const nameLabel = t("career.onboarding.onboarding.1wh5aat", "이름");
  const emailLabel = t(
    "career.settings.career_settings_modal.account_email",
    "이메일"
  );
  const phoneNumberLabel = t(
    "career.profile.personal_info.phone_number",
    "휴대폰 번호"
  );

  return (
    <section aria-labelledby="career-profile-personal-info-title">
      <div className="flex items-center text-[15px] font-medium leading-6 text-neutral-primary mt-2">
        {t("career.profile.personal_info.title", "개인 정보")}
      </div>

      <div className="mt-3 grid gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          {isEditing ? (
            <label className={personalInfoFieldClassName}>
              <PersonalInfoLabel label={nameLabel} />
              <Input
                value={user?.name ?? ""}
                onChange={(event) => onFieldChange("name", event.target.value)}
              />
            </label>
          ) : (
            <BareButton
              type="button"
              onClick={onEdit}
              aria-label={nameLabel}
              className={cn(
                personalInfoFieldClassName,
                "flex-1 hover:border-neutral-400 hover:bg-bg-weak"
              )}
            >
              <PersonalInfoLabel label={nameLabel} />
              <PersonalInfoValue value={user?.name} />
            </BareButton>
          )}

          {isEditing ? (
            <label className={cn(personalInfoFieldClassName, "flex-1")}>
              <PersonalInfoLabel label={emailLabel} />
              <Input
                type="email"
                readOnly
                aria-haspopup="dialog"
                value={user?.email ?? ""}
                onClick={onOpenEmailChangeModal}
                className="cursor-pointer"
              />
            </label>
          ) : (
            <BareButton
              type="button"
              onClick={onOpenEmailChangeModal}
              aria-label={emailLabel}
              className={cn(
                personalInfoFieldClassName,
                "flex-1 hover:border-neutral-400 hover:bg-bg-weak"
              )}
            >
              <PersonalInfoLabel label={emailLabel} />
              <PersonalInfoValue value={user?.email} />
            </BareButton>
          )}
        </div>
      </div>
    </section>
  );
};

export default CareerProfilePersonalInfo;
