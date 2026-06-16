import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useState } from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { useMessages } from "@/i18n/useMessage";
import { CompanyDetailView } from "./CompanyDetailView";
import type {
  CompanyDetailPayload,
  CompanyWatchlistItem,
} from "./watchlistTypes";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { careerT } from "@/lib/career/translatedCareerMessage";

const DETAIL_QUERY_KEY = "career-company-watchlist-detail";

type CareerCompanyDetailDrawerProps = {
  companyDbId: number | null;
  onClose: () => void;
  open: boolean;
  source?: string;
};

const CareerCompanyDetailDrawer = ({
  companyDbId,
  onClose,
  open,
  source = "position_company_detail",
}: CareerCompanyDetailDrawerProps) => {
  const t = useCareerT();

  const queryClient = useQueryClient();
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const { onUpdateCompanyFollow, user } = useCareerSidebarContext();
  const userId = user?.id ?? null;
  const [updatingCompanyId, setUpdatingCompanyId] = useState<number | null>(
    null
  );
  const [actionError, setActionError] = useState<{
    companyDbId: number;
    message: string;
  } | null>(null);

  const detailQuery = useQuery({
    queryKey: [DETAIL_QUERY_KEY, userId, companyDbId, locale],
    enabled: open && Boolean(user && companyDbId),
    queryFn: async () => {
      const params = new URLSearchParams({
        companyDbId: String(companyDbId ?? ""),
        locale,
      });
      const response = await fetchWithAuth(
        `/api/talent/company-watchlist?${params.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as CompanyDetailPayload & Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            careerT(
              "ko",
              "career.company.career_company_detail_drawer.0amy3om",
              "회사 정보를 불러오지 못했습니다."
            )
          )
        );
      }

      return payload;
    },
    staleTime: 30_000,
  });

  const handleClose = useCallback(() => {
    setActionError(null);
    onClose();
  }, [onClose]);

  const handleToggleFollow = useCallback(
    async (
      item: CompanyWatchlistItem,
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setActionError(null);
      setUpdatingCompanyId(item.companyDbId);

      try {
        const result = await onUpdateCompanyFollow({
          action: item.following ? "unfollow" : "follow",
          companyDbId: item.companyDbId,
          companyWorkspaceId: item.companyWorkspaceId,
          source,
        });

        if (!result) {
          throw new Error(
            careerT(
              "ko",
              "career.common.career_flow_provider.19x0zaz",
              "회사 팔로우 상태를 변경하지 못했습니다."
            )
          );
        }

        if (result.item) {
          queryClient.setQueryData(
            [DETAIL_QUERY_KEY, userId, item.companyDbId, locale],
            { item: result.item }
          );
        }

        await queryClient.invalidateQueries({
          queryKey: ["career-company-watchlist"],
        });
      } catch (error) {
        setActionError({
          companyDbId: item.companyDbId,
          message:
            error instanceof Error
              ? error.message
              : careerT(
                  "ko",
                  "career.common.career_flow_provider.19x0zaz",
                  "회사 팔로우 상태를 변경하지 못했습니다."
                ),
        });
      } finally {
        setUpdatingCompanyId(null);
      }
    },
    [locale, onUpdateCompanyFollow, queryClient, source, userId]
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, open]);

  const detailItem = detailQuery.data?.item ?? null;
  const loading =
    detailQuery.isLoading || (detailQuery.isFetching && !detailItem);
  const visibleActionError =
    actionError && actionError.companyDbId === companyDbId
      ? actionError.message
      : "";
  const errorMessage =
    detailQuery.error instanceof Error ? detailQuery.error.message : "";

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80]">
          <motion.button
            type="button"
            aria-label={t(
              "career.company.career_company_detail_drawer.1v2v38p",
              "회사 정보 닫기"
            )}
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t(
              "career.company.career_company_detail_drawer.0ihv86b",
              "회사 상세 정보"
            )}
            className="absolute right-0 top-0 flex h-full w-full max-w-[760px] flex-col border-l border-neutral-1000-a05 bg-bg-floating text-neutral-primary shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="flex h-12 shrink-0 items-center justify-end border-b border-neutral-1000-a05 px-4">
              <BareButton
                type="button"
                aria-label={t(
                  "career.common.career_support_inquiry_modal.11apzn2",
                  "닫기"
                )}
                onClick={handleClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition-colors hover:bg-bg-weak hover:text-neutral-primary"
              >
                <X className="h-4 w-4" />
              </BareButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4 sm:px-7">
              {errorMessage ? (
                <div className="mb-4 rounded-[8px] border border-critical/30 bg-critical-faded px-4 py-3 text-[13px] text-critical">
                  {errorMessage}
                </div>
              ) : null}
              <CompanyDetailView
                item={detailItem}
                loading={loading}
                onBack={handleClose}
                onToggleFollow={handleToggleFollow}
                updating={
                  detailItem
                    ? updatingCompanyId === detailItem.companyDbId
                    : false
                }
              />
              {visibleActionError ? (
                <div className="mt-4 rounded-[8px] border border-critical/30 bg-critical-faded px-4 py-3 text-[13px] text-critical">
                  {visibleActionError}
                </div>
              ) : null}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default React.memo(CareerCompanyDetailDrawer);
