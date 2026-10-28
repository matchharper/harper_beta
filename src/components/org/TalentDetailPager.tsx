import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
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
  onNextPage,
  nextPagePending = false,
}: {
  compact?: boolean;
  disabled?: boolean;
  navigation: TalentDetailNavigationState;
  onNavigate: (target: TalentDetailNavigationState["next"] | null) => void;
  onNextPage?: () => void;
  nextPagePending?: boolean;
}) {
  const { c } = useOrgLocale();
  return (
    <div
      aria-label={c("후보자 {p0} / {p1}", "Candidate {p0} / {p1}", {
        p0: navigation.position,
        p1: navigation.total,
      })}
      className={cn(
        "inline-flex shrink-0 overflow-hidden bg-bg-weak/80 backdrop-blur-sm py-0.5 px-0.5 font-normal",
        compact ? "rounded-full" : "rounded-md"
      )}
      role="group"
    >
      <MuteButton
        aria-label={c("이전 후보자", "Previous candidate")}
        className="rounded-none border-0 shadow-none max-md:px-1 max-md:py-1.5"
        disabled={disabled || !navigation.previous}
        onClick={() => onNavigate(navigation.previous)}
        size={compact ? "sm" : "md"}
        variant="transparent"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </MuteButton>
      <div
        aria-live="polite"
        className={cn(
          "flex items-center justify-center tabular-nums text-neutral-primary max-md:min-w-9 max-md:px-1 max-md:text-[12px]",
          compact ? "min-w-12 px-2 text-[12px]" : "min-w-14 px-2.5 text-[14px]"
        )}
      >
        {navigation.position} / {navigation.total}
      </div>
      <MuteButton
        aria-label={c("다음 후보자", "Next candidate")}
        className="rounded-none border-0 shadow-none max-md:px-1 max-md:py-1.5"
        disabled={
          disabled || nextPagePending || (!navigation.next && !onNextPage)
        }
        onClick={() =>
          navigation.next ? onNavigate(navigation.next) : onNextPage?.()
        }
        size={compact ? "sm" : "md"}
        variant="transparent"
      >
        {nextPagePending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <ChevronRight aria-hidden className="size-4" />
        )}
      </MuteButton>
    </div>
  );
}
