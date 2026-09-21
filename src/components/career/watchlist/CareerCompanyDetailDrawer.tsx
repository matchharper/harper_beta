import TalentCareerModal from "@/components/common/TalentCareerModal";
import CompanyJobsList from "./CompanyJobsList";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useRef, useState } from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { useCareerCompanyFollowContext } from "@/components/career/CareerSidebarContext";
import { useMessages } from "@/i18n/useMessage";
import { CompanyDetailView } from "./CompanyDetailView";
import type {
  CompanyDetailPayload,
  CompanyWatchlistItem,
} from "./watchlistTypes";
import { useCareerT } from "@/i18n/useCareerT";
import { FollowButton } from "./FollowButton";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { cn } from "@/lib/utils";
import HistoryOpportunityRoleActions, {
  COMPANY_DETAIL_ROLE_ACTIONS,
} from "../history/HistoryOpportunityRoleActions";

const DETAIL_QUERY_KEY = "career-company-watchlist-detail";

type CareerCompanyDetailDrawerProps = {
  companyDbId: number | null;
  roleId?: string | null;
  mobileLayout?: boolean;
  onClose: () => void;
  onOpenChat?: () => void;
  open: boolean;
  opportunity?: CareerHistoryOpportunity | null;
  showCompanyJobsInitially?: boolean;
  source?: string;
};

const CareerCompanyDetailDrawer = ({
  companyDbId,
  roleId,
  mobileLayout = false,
  onClose,
  onOpenChat,
  open,
  opportunity,
  showCompanyJobsInitially = false,
  source = "position_company_detail",
}: CareerCompanyDetailDrawerProps) => {
  const t = useCareerT();
  const jobsSection = useRef<HTMLDivElement>(null);
  const targetRoleId = roleId ?? opportunity?.roleId;
  const companyJobsVisibilityKey = `${companyDbId ?? ""}:${targetRoleId ?? ""}`;
  const [visibleCompanyJobsKey, setVisibleCompanyJobsKey] = useState<
    string | null
  >(null);
  const companyJobsVisible =
    open &&
    (showCompanyJobsInitially ||
      visibleCompanyJobsKey === companyJobsVisibilityKey);
  const showCompanyJobs = () => {
    setVisibleCompanyJobsKey(companyJobsVisibilityKey);
    window.requestAnimationFrame(() =>
      jobsSection.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    );
  };

  const queryClient = useQueryClient();
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const { onUpdateCompanyFollow, user } = useCareerCompanyFollowContext();
  const userId = user?.id ?? null;
  const [updatingCompanyId, setUpdatingCompanyId] = useState<number | null>(
    null
  );
  const [actionError, setActionError] = useState<{
    companyDbId: number;
    message: string;
  } | null>(null);

  const detailQuery = useQuery({
    queryKey: [DETAIL_QUERY_KEY, userId, companyDbId, targetRoleId, locale],
    enabled: open && Boolean(user && (companyDbId || targetRoleId)),
    queryFn: async () => {
      const params = new URLSearchParams({ locale });
      if (companyDbId) params.set("companyDbId", String(companyDbId));
      else if (targetRoleId) params.set("roleId", targetRoleId);
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
            t(
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
    setVisibleCompanyJobsKey(null);
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
            t(
              "career.common.career_flow_provider.19x0zaz",
              "회사 팔로우 상태를 변경하지 못했습니다."
            )
          );
        }

        if (result.item) {
          queryClient.setQueryData(
            [DETAIL_QUERY_KEY, userId, companyDbId, targetRoleId, locale],
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
              : t(
                  "career.common.career_flow_provider.19x0zaz",
                  "회사 팔로우 상태를 변경하지 못했습니다."
                ),
        });
      } finally {
        setUpdatingCompanyId(null);
      }
    },
    [
      companyDbId,
      targetRoleId,
      locale,
      onUpdateCompanyFollow,
      queryClient,
      source,
      t,
      userId,
    ]
  );

  const detailItem = detailQuery.data?.item ?? null;
  const loading =
    detailQuery.isLoading || (detailQuery.isFetching && !detailItem);
  const visibleActionError =
    actionError && actionError.companyDbId === detailItem?.companyDbId
      ? actionError.message
      : "";
  const errorMessage =
    detailQuery.error instanceof Error ? detailQuery.error.message : "";

  return (
    <TalentCareerModal
      open={open}
      modal={mobileLayout}
      closeOnBackdrop={mobileLayout}
      onClose={handleClose}
      ariaLabel={t("career.company.jobs.company_detail", "회사 상세 정보")}
      overlayClassName="z-[81] items-stretch justify-end p-0 sm:p-0"
      backdropClassName={
        mobileLayout
          ? "bg-black/25 backdrop-blur-[1px]"
          : "bg-transparent backdrop-blur-none"
      }
      panelClassName="flex h-dvh w-full max-w-[760px] flex-col rounded-none border-0 border-l border-neutral-1000-a05 bg-bg-floating data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
      bodyClassName={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8 pt-12",
        mobileLayout ? "overflow-x-hidden px-4" : "px-5 sm:px-7"
      )}
    >
      {errorMessage ? (
        <p role="alert" className="mb-4 text-sm text-critical">
          {errorMessage}
        </p>
      ) : null}
      {mobileLayout && detailItem ? (
        <div className="mb-3 flex justify-end">
          <FollowButton
            disabled={updatingCompanyId === detailItem.companyDbId}
            following={detailItem.following}
            onClick={(event) => handleToggleFollow(detailItem, event)}
          />
        </div>
      ) : null}
      {loading || detailItem ? (
        <CompanyDetailView
          item={detailItem}
          loading={loading}
          mobileLayout={mobileLayout}
          onBack={handleClose}
          onOpenChat={onOpenChat}
          onToggleFollow={handleToggleFollow}
          roleActionOpportunity={opportunity}
          onShowCompanyJobs={showCompanyJobs}
          updating={
            detailItem ? updatingCompanyId === detailItem.companyDbId : false
          }
        />
      ) : opportunity ? (
        <section>
          <h2 className="text-xl font-medium">{opportunity.companyName}</h2>
          {opportunity.companyDescription && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-muted">
              {opportunity.companyDescription}
            </p>
          )}
          {mobileLayout && (
            <HistoryOpportunityRoleActions
              className="mt-6"
              item={opportunity}
              visibleActions={COMPANY_DETAIL_ROLE_ACTIONS}
              onOpenChat={onOpenChat}
              onShowCompanyJobs={showCompanyJobs}
            />
          )}
        </section>
      ) : null}
      {visibleActionError && (
        <p role="alert" className="mt-4 text-sm text-critical">
          {visibleActionError}
        </p>
      )}
      {companyJobsVisible ? (
        <div ref={jobsSection}>
          <CompanyJobsList
            key={companyDbId ?? targetRoleId}
            companyDbId={companyDbId ?? detailItem?.companyDbId}
            roleId={targetRoleId}
          />
        </div>
      ) : null}
    </TalentCareerModal>
  );
};

export default React.memo(CareerCompanyDetailDrawer);
