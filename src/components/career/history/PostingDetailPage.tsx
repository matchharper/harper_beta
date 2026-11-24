import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import {
  useCareerCompanyFollowContext,
  useCareerHistoryContext,
} from "@/components/career/CareerSidebarContext";
import { MuteButton } from "@/components/ui/button";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import {
  getCareerPositiveActionIcon,
  getCareerPositiveActionLabel,
} from "../opportunityTypeMeta";
import type { CareerHistoryOpportunity } from "../types";
import { getExternalOpportunityApplyLabel } from "./hiringPost";
import {
  OpportunityActionGrid,
  opportunityActionClass,
} from "./HistoryOpportunityDetailActions";
import OpportunityDetailPage from "./OpportunityDetailPage";
import { postingDetailQueryKey } from "./postingDetail";

/**
 * A posting that is not yet one of this person's opportunities, opened as a page. Liking it or
 * starting to apply makes it one (recommendation and like in one save), so the usual apply flow
 * and history work on it from then on.
 */
export default function PostingDetailPage({
  backLabel,
  onApply,
  onBack,
  onOpenCompany,
  onOpenLink,
  onOpenSimilar,
  roleId,
}: {
  backLabel: string;
  /** The usual apply flow, given the posting once it is one of this person's opportunities. */
  onApply: (item: CareerHistoryOpportunity) => void;
  onBack: () => void;
  onOpenCompany?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
  onOpenSimilar: (item: CareerHistoryOpportunity) => void;
  roleId: string;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { user } = useCareerCompanyFollowContext();
  const { fetchWithAuth } = useCareerApi();
  const { onRefreshHistoryOpportunities } = useCareerHistoryContext();
  const queryClient = useQueryClient();
  const logCareerEvent = useCareerLogEvent();
  const queryKey = postingDetailQueryKey(user?.id, roleId, locale);
  const query = useQuery({
    queryKey,
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<CareerHistoryOpportunity | null> => {
      const params = new URLSearchParams({ roleId, locale });
      const response = await fetchWithAuth(`/api/talent/inline-card?${params}`, {
        signal,
      });
      if (!response.ok) throw new Error("Failed to load posting");
      return (await response.json()).role ?? null;
    },
  });
  const [pending, setPending] = useState<"like" | "apply" | null>(null);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const item = query.data ?? null;
  const liked = item?.feedback === "positive" && item.savedStage !== "hidden";

  /** Makes the posting one of this person's opportunities, liked; returns it with its own id. */
  const ensureSaved = async (current: CareerHistoryOpportunity) => {
    if (current.feedback === "positive" && current.savedStage !== "hidden")
      return current;
    const response = await fetchWithAuth("/api/talent/opportunities/save", {
      method: "POST",
      body: JSON.stringify({ roleId: current.roleId, locale }),
    });
    const result = await response.json();
    if (!response.ok || !result.opportunity) throw new Error("Save failed");
    const saved = result.opportunity as CareerHistoryOpportunity;
    queryClient.setQueryData(queryKey, saved);
    // The history list must hold it before the apply flow updates it.
    await Promise.allSettled([
      onRefreshHistoryOpportunities(saved.roleId),
      queryClient.invalidateQueries({ queryKey: ["career-company-jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["career-similar-opportunities"] }),
    ]);
    return saved;
  };

  const run = async (action: "like" | "apply") => {
    if (!item || saving.current) return;
    logCareerEvent(`click_posting_${action === "like" ? "positive" : "apply"}`, {
      roleId: item.roleId,
    });
    saving.current = true;
    setPending(action);
    setError("");
    try {
      const saved = await ensureSaved(item);
      if (action === "apply") onApply(saved);
    } catch {
      setError(
        t(
          "career.company.jobs.save_failed",
          "포지션을 저장하지 못했어요. 다시 시도해 주세요."
        )
      );
    } finally {
      saving.current = false;
      setPending(null);
    }
  };

  if (!item) {
    return (
      <section className="min-w-0 pb-10">
        <MuteButton variant="transparent" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          {backLabel}
        </MuteButton>
        {query.isPending ? (
          <div
            className="flex justify-center py-10"
            role="status"
            aria-label={t("career.company.jobs.loading", "포지션 불러오는 중")}
          >
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <p role="alert" className="mt-6 text-sm text-critical">
            {t("career.company.jobs.load_failed", "포지션을 불러오지 못했어요.")}
          </p>
        )}
      </section>
    );
  }

  return (
    <OpportunityDetailPage
      item={item}
      backLabel={backLabel}
      onBack={onBack}
      onOpenCompany={onOpenCompany}
      onOpenLink={onOpenLink}
      onOpenSimilar={onOpenSimilar}
      actions={
        item.sourceType === "external" ? (
          <PostingActions
            item={item}
            liked={liked}
            pending={pending}
            error={error}
            onLike={() => void run("like")}
            onApply={() => void run("apply")}
          />
        ) : undefined
      }
    />
  );
}

function PostingActions({
  error,
  item,
  liked,
  onApply,
  onLike,
  pending,
}: {
  error: string;
  item: CareerHistoryOpportunity;
  liked: boolean;
  onApply: () => void;
  onLike: () => void;
  pending: "like" | "apply" | null;
}) {
  const t = useCareerT();
  const PositiveIcon = liked ? Check : getCareerPositiveActionIcon(item.opportunityType);
  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
      <OpportunityActionGrid>
        <MuteButton
          disabled={pending !== null || liked}
          onClick={onLike}
          size="md"
          variant="neutral"
          className={opportunityActionClass}
        >
          {pending === "like" ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : PositiveIcon ? (
            <PositiveIcon aria-hidden className="size-3.5" />
          ) : null}
          {getCareerPositiveActionLabel(item.opportunityType, t)}
        </MuteButton>
        <MuteButton
          disabled={pending !== null}
          onClick={onApply}
          size="md"
          variant="primary"
          className={opportunityActionClass}
        >
          {pending === "apply" ? (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          ) : null}
          {getExternalOpportunityApplyLabel(item, t)}
        </MuteButton>
      </OpportunityActionGrid>
    </div>
  );
}
