import { ChevronRight, Loader2 } from "lucide-react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { useCareerChatPanelContext } from "./CareerChatPanelContext";
import { CompanyLogo } from "./watchlist/CompanyLogo";
import {
  useDailyExternalRecommendations,
  type DailyExternalSnapshot,
} from "@/hooks/career/useDailyExternalRecommendations";
import { useCareerT } from "@/i18n/useCareerT";

function useSnapshot() {
  const { user, isOnboardingDone, stage } = useCareerSidebarContext();
  const { tasksOverride, pendingActionsOverride } = useCareerChatPanelContext();
  return useDailyExternalRecommendations(
    user?.id,
    tasksOverride === undefined &&
      pendingActionsOverride === undefined &&
      (isOnboardingDone || stage === "completed")
  );
}
export function CareerDailyExternalStatus() {
  const snapshot = useSnapshot();
  return snapshot?.running ? <ExternalSearchStatusChip /> : null;
}
export function ExternalSearchStatusChip() {
  const t = useCareerT();
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-action-faded px-2 py-0.5 text-[12px] leading-5 text-action"
    >
      <Loader2
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
      />
      {t(
        "career.external_daily.searching",
        "당장 보여드릴 기회를 찾고 있어요..."
      )}
    </div>
  );
}
export function CareerTodayExternalRecommendations({
  onOpenOpportunity,
}: {
  onOpenOpportunity: (roleId: string, filter: "new") => void;
}) {
  const snapshot = useSnapshot();
  return snapshot?.roles.length ? (
    <TodayExternalRecommendationsCard
      roles={snapshot.roles}
      onOpenOpportunity={onOpenOpportunity}
    />
  ) : null;
}
export function TodayExternalRecommendationsCard({
  roles,
  onOpenOpportunity,
}: {
  roles: DailyExternalSnapshot["roles"];
  onOpenOpportunity: (roleId: string, filter: "new") => void;
}) {
  const t = useCareerT();
  if (!roles.length) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenOpportunity(roles[0].roleId, "new")}
      className="mt-4 flex w-full items-center gap-2 rounded-xl bg-action-faded px-3 py-3 text-left transition-colors hover:bg-action-faded/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
    >
      <span
        aria-hidden="true"
        className="flex shrink-0 items-center pl-0.5 pr-1"
      >
        {roles.slice(0, 3).map((role, index) => (
          <span
            key={role.roleId}
            className={`relative -ml-1.5 rounded-[11px] shadow-sm first:ml-0 ${index === 0 ? "-rotate-6" : index === 2 ? "rotate-6" : "z-10"}`}
          >
            <CompanyLogo
              logoUrl={role.companyLogoUrl}
              name={role.companyName}
              size="xm"
            />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-neutral-primary">
          {t("career.external_daily.today", "오늘의 기회들을 확인해 보세요")}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-action"
      />
    </button>
  );
}
