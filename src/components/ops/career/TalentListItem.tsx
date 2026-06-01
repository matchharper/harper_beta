import { memo, useCallback } from "react";
import { ChevronRight, FileText, Github, Link2, Linkedin } from "lucide-react";
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
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-beige500/60 text-beige900/40"
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

  const handleClick = useCallback(() => {
    onSelect(talent.userId);
  }, [onSelect, talent.userId]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cx(
        "w-full text-left px-4 py-3 transition border-b border-beige900/5",
        isActive ? "bg-beige900/5" : "hover:bg-white/60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-geist text-sm font-medium text-beige900 truncate">
              {talent.name || talent.email || "이름 없음"}
            </span>
            <span
              className={cx(
                "shrink-0 rounded px-1.5 py-0.5 font-geist text-[11px] font-medium",
                onboardingStatusBadgeClass(talent.isOnboardingDone)
              )}
            >
              {onboardingStatusLabel(talent.isOnboardingDone)}
            </span>
          </div>
          {currentPositionLabel ? (
            <div
              className={cx(
                "mt-0.5 font-geist text-xs text-beige900/80 truncate",
                expanded && expandedExperienceLabel ? "hidden" : ""
              )}
              title={currentPositionLabel}
            >
              {currentPositionLabel}
            </div>
          ) : null}
          {expanded && expandedExperienceLabel ? (
            <div
              className="mt-1 line-clamp-2 font-geist text-[13px] text-beige900/80"
              title={expandedExperienceLabel}
            >
              {expandedExperienceLabel}
            </div>
          ) : null}
          {expanded && expandedEducationLabel ? (
            <div
              className="mt-0.5 truncate font-geist text-[12px] text-black/60"
              title={expandedEducationLabel}
            >
              {expandedEducationLabel}
            </div>
          ) : null}
          {memoPreview ? (
            <div
              className="mt-1 truncate font-geist text-[12px] text-black"
              title={memoPreview}
            >
              {memoPreview}
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-2 font-geist text-[11px] text-beige900/60">
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
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-beige500/60 text-beige900/40"
                  >
                    <FileText className="h-2.5 w-2.5" aria-hidden="true" />
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-beige900/25" />
      </div>
    </button>
  );
});
