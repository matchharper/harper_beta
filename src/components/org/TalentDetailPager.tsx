import { ChevronLeft, ChevronRight } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { cn } from "@/lib/utils";
import type {
  OrgTalentDetailNavigationState,
  OrgTalentDetailNavigationTarget,
} from "@/lib/org/detailNavigation";

type TalentDetailNavigationState =
  OrgTalentDetailNavigationState<OrgTalentDetailNavigationTarget>;

export function TalentDetailPager({
  compact = false,
  disabled = false,
  navigation,
  onNavigate,
}: {
  compact?: boolean;
  disabled?: boolean;
  navigation: TalentDetailNavigationState;
  onNavigate: (target: TalentDetailNavigationState["next"] | null) => void;
}) {
  const { c } = useOrgLocale();
  return (
    <div
      aria-label={c("후보자 {p0} / {p1}", "Candidate {p0} / {p1}", {
        p0: navigation.position,
        p1: navigation.total,
      })}
      className={cn(
        "inline-flex shrink-0 overflow-hidden bg-bg-weak/50 backdrop-blur-sm font-normal",
        compact ? "rounded-full" : "rounded-sm"
      )}
      role="group"
    >
      <MuteButton
        aria-label={c("이전 후보자", "Previous candidate")}
        className="rounded-none border-0 border-r border-neutral-1000-a10 shadow-none"
        disabled={disabled || !navigation.previous}
        onClick={() => onNavigate(navigation.previous)}
        size={compact ? "sm" : "lg"}
        variant="transparent"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </MuteButton>
      <div
        aria-live="polite"
        className={cn(
          "flex items-center justify-center tabular-nums text-neutral-primary",
          compact ? "min-w-12 px-2 text-[12px]" : "min-w-16 px-3 text-[16px]"
        )}
      >
        {navigation.position} / {navigation.total}
      </div>
      <MuteButton
        aria-label={c("다음 후보자", "Next candidate")}
        className="rounded-none border-0 border-l border-neutral-1000-a10 shadow-none"
        disabled={disabled || !navigation.next}
        onClick={() => onNavigate(navigation.next)}
        size={compact ? "sm" : "lg"}
        variant="transparent"
      >
        <ChevronRight aria-hidden className="size-4" />
      </MuteButton>
    </div>
  );
}
