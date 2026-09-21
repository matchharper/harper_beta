import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { useCareerHistoryContext } from "@/components/career/CareerSidebarContext";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import HistoryOpportunityDetailContent from "./HistoryOpportunityDetailContent";

function PreviewContent({
  item,
  onSaved,
}: {
  item: CareerHistoryOpportunity;
  onSaved: (item: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { fetchWithAuth } = useCareerApi();
  const { onRefreshHistoryOpportunities } = useCareerHistoryContext();
  const queryClient = useQueryClient();
  const [savedItem, setSavedItem] = useState<CareerHistoryOpportunity | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const current = savedItem ?? item;
  const saved =
    current.feedback === "positive" && current.savedStage !== "hidden";
  const save = async () => {
    if (saving.current || saved) return;
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetchWithAuth("/api/talent/opportunities/save", {
        method: "POST",
        body: JSON.stringify({ roleId: item.roleId, locale }),
      });
      const result = await response.json();
      if (!response.ok || !result.opportunity) throw new Error("Save failed");
      setSavedItem(result.opportunity);
      onSaved(result.opportunity);
      await Promise.allSettled([
        onRefreshHistoryOpportunities(item.roleId),
        queryClient.invalidateQueries({ queryKey: ["career-company-jobs"] }),
      ]);
    } catch {
      setError(
        t(
          "career.company.jobs.save_failed",
          "포지션을 저장하지 못했어요. 다시 시도해 주세요."
        )
      );
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  return (
    <>
      <HistoryOpportunityDetailContent
        item={current}
        showRoleActions={false}
        onOpenLink={(url) => window.open(url, "_blank", "noopener,noreferrer")}
        onOpenOpportunityInfo={() => undefined}
      />
      {item.sourceType === "external" && (
        <div className="mt-5 px-3 pb-3">
          {error && (
            <p role="alert" className="mb-3 text-sm text-critical">
              {error}
            </p>
          )}
          <MuteButton
            variant="primary"
            size="lg"
            className="w-full"
            disabled={pending || saved}
            onClick={() => void save()}
          >
            {pending
              ? t("career.company.jobs.saving", "저장 중...")
              : saved
                ? t("career.company.jobs.saved", "저장됨")
                : t("career.company.jobs.save", "저장하기")}
          </MuteButton>
        </div>
      )}
    </>
  );
}

export default function CareerOpportunityPreviewModal({
  item,
  onClose,
  onSaved = () => undefined,
}: {
  item: CareerHistoryOpportunity | null;
  onClose: () => void;
  onSaved?: (item: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  return (
    <TalentCareerModal
      open={Boolean(item)}
      onClose={onClose}
      ariaLabel={t("career.history.job_actions.preview_modal", "포지션 상세")}
      backdropClassName="z-[100]"
      overlayClassName="z-[100] items-start pt-6 sm:pt-10"
      panelClassName="w-[calc(100vw-24px)] max-w-[880px] border border-neutral-1000-a05 bg-bg-floating sm:w-[min(880px,86vw)]"
      bodyClassName="max-h-[88svh] overflow-y-auto bg-bg-floating px-3 pb-3 pt-14 sm:max-h-[82svh] sm:px-5 sm:pb-5"
      mobileBottomSheet
    >
      {item && (
        <PreviewContent key={item.roleId} item={item} onSaved={onSaved} />
      )}
    </TalentCareerModal>
  );
}
