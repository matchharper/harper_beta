import { memo, useCallback } from "react";
import {
  ChevronRight,
  FileText,
  Github,
  Link2,
  Linkedin,
  MessageSquareText,
} from "lucide-react";
import { cx } from "@/components/ops/theme";
import type {
  CareerTalentRegisteredLinkType,
  CareerTalentSummary,
} from "@/lib/opsCareerServer";
import {
  formatCurrentPositionLabel,
  formatKst,
  onboardingStatusBadgeClass,
  onboardingStatusLabel,
  registeredLinkTypeLabel,
} from "./utils";
import { BareButton } from "@/components/ui/button";

function RegisteredLinkIcon({
  type,
}: {
  type: CareerTalentRegisteredLinkType;
}) {
  const label = registeredLinkTypeLabel(type);
  const Icon =
    type === "linkedin" ? Linkedin : type === "github" ? Github : Link2;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-weak text-neutral-soft"
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
    </span>
  );
}

type TalentListItemProps = {
  expanded: boolean;
  isActive: boolean;
  onSelect: (userId: string) => void;
  talent: CareerTalentSummary;
};

export const TalentListItem = memo(function TalentListItem({
  expanded,
  isActive,
  onSelect,
  talent,
}: TalentListItemProps) {
  const currentPositionLabel = formatCurrentPositionLabel(talent);
  const expandedExperienceLabel =
    talent.expandedExperienceLabels &&
    talent.expandedExperienceLabels.length > 0
      ? talent.expandedExperienceLabels.join(" - ")
      : "";
  const expandedEducationLabel =
    talent.expandedEducationLabels && talent.expandedEducationLabels.length > 0
      ? talent.expandedEducationLabels.join(" - ")
      : "";
  const registeredLinkTypes =
    talent.registeredLinkTypes?.length > 0
      ? talent.registeredLinkTypes
      : talent.hasRegisteredLink
        ? (["other"] as CareerTalentRegisteredLinkType[])
        : [];
  const hasProfileInputSignal =
    registeredLinkTypes.length > 0 || talent.hasResume;
  const memoPreview = talent.opsProfileMemoPreview?.trim();
  const profileMemoPreviews = talent.profileMemoPreviews ?? [];

  const handleClick = useCallback(() => {
    onSelect(talent.userId);
  }, [onSelect, talent.userId]);

  return (
    <BareButton
      type="button"
      onClick={handleClick}
      className={cx(
        "w-full text-left px-4 py-3 transition border-b border-neutral-1000-a05",
        isActive ? "bg-bg-floating" : "hover:bg-bg-default/60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-neutral-primary truncate">
              {talent.name || talent.email || "이름 없음"}
            </span>
            <span
              className={cx(
                "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                onboardingStatusBadgeClass(talent.isOnboardingDone)
              )}
            >
              {onboardingStatusLabel(talent.isOnboardingDone)}
            </span>
          </div>
          {currentPositionLabel ? (
            <div
              className={cx(
                "mt-0.5 text-xs text-neutral-primary truncate",
                expanded && expandedExperienceLabel ? "hidden" : ""
              )}
              title={currentPositionLabel}
            >
              {currentPositionLabel}
            </div>
          ) : null}
          {expanded && expandedExperienceLabel ? (
            <div
              className="mt-1 line-clamp-2 text-[13px] text-neutral-primary"
              title={expandedExperienceLabel}
            >
              {expandedExperienceLabel}
            </div>
          ) : null}
          {expanded && expandedEducationLabel ? (
            <div
              className="mt-0.5 truncate text-[12px] text-neutral-muted"
              title={expandedEducationLabel}
            >
              {expandedEducationLabel}
            </div>
          ) : null}
          {memoPreview ? (
            <div
              className="mt-2 rounded-md border border-positive/30 bg-positive-faded/75 px-2 py-1.5 text-positive"
              title={memoPreview}
            >
              <div
                className={cx(
                  "leading-5",
                  expanded
                    ? "text-[14px] line-clamp-4"
                    : "text-[12px] line-clamp-2"
                )}
              >
                {memoPreview}
              </div>
            </div>
          ) : null}
          {expanded && profileMemoPreviews.length > 0 ? (
            <div className="mt-2 space-y-1">
              {profileMemoPreviews.map((preview, index) => (
                <div
                  key={`${preview.source}-${preview.label}-${index}`}
                  className="rounded-md border border-neutral-1000-a05 bg-bg-default/55 px-2 py-1.5 "
                  title={`${preview.label}: ${preview.memo}`}
                >
                  <div className="truncate text-[10px] font-medium text-neutral-muted">
                    {preview.source === "experience"
                      ? "경력 메모"
                      : "학력 메모"}{" "}
                    · {preview.label}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-neutral-muted">
                    {preview.memo}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-muted">
            <span>{formatKst(talent.lastConversationAt)}</span>
            {hasProfileInputSignal ? (
              <span className="inline-flex shrink-0 items-center gap-1">
                {registeredLinkTypes.map((type) => (
                  <RegisteredLinkIcon key={type} type={type} />
                ))}
                {talent.hasResume ? (
                  <span
                    role="img"
                    aria-label="이력서 있음"
                    title="이력서 있음"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-weak text-neutral-soft"
                  >
                    <FileText className="h-2.5 w-2.5" aria-hidden="true" />
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-soft" />
      </div>
    </BareButton>
  );
});
