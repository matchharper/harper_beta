import OpsShell from "@/components/ops/OpsShell";
import { OpsReferralDetailDrawer } from "@/components/ops/referrals/OpsReferralDetailDrawer";
import { OpsReferralFilterDropdown } from "@/components/ops/referrals/OpsReferralEditors";
import { OpsReferralTable } from "@/components/ops/referrals/OpsReferralTable";
import {
  getOpsReferralItemKey,
  getOpsReferralSavingKey,
  mergeOpsReferralUpdate,
} from "@/components/ops/referrals/shared";
import type {
  OpsReferralPayoutInformationUpdatedHandler,
  OpsReferralUpdateHandler,
} from "@/components/ops/referrals/types";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { isInternalEmail } from "@/lib/internalAccess";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  OPS_REFERRALS_PAGE_SIZE,
  type OpsReferralItem,
  type OpsReferralListResponse,
  type OpsReferralStageOption,
  type OpsReferralUpdateResponse,
} from "@/lib/ops/referrals";
import { useAuthStore } from "@/store/useAuthStore";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const REWARD_FILTER_OPTIONS = [
  { id: "", label: "지급 완료 여부 전체" },
  { id: "true", label: "지급 완료" },
  { id: "false", label: "지급 미완료" },
] as const satisfies readonly OpsReferralStageOption[];

const EMPTY_REFERRAL_ITEMS: OpsReferralItem[] = [];

export default function OpsReferralsPage() {
  const { loading: authLoading, user } = useAuthStore();
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [rewardPaidFilter, setRewardPaidFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OpsReferralListResponse | null>(null);
  const [error, setError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedReferral, setSelectedReferral] =
    useState<OpsReferralItem | null>(null);
  const savingKeysRef = useRef<Set<string>>(new Set());
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    if (!canFetchInternal) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const searchParams = new URLSearchParams({
          limit: String(OPS_REFERRALS_PAGE_SIZE),
          offset: String((page - 1) * OPS_REFERRALS_PAGE_SIZE),
        });
        if (searchQuery) searchParams.set("query", searchQuery);
        if (stageFilter) searchParams.set("stage", stageFilter);
        if (rewardPaidFilter) {
          searchParams.set("rewardPaid", rewardPaidFilter);
        }
        const payload = await fetchWithInternalAuth<OpsReferralListResponse>(
          `/api/internal/referrals?${searchParams.toString()}`,
          { signal: controller.signal }
        );
        setData(payload);
        setSelectedReferral((current) => {
          if (!current) return null;
          return (
            payload.items.find(
              (item) =>
                getOpsReferralItemKey(item) === getOpsReferralItemKey(current)
            ) ?? current
          );
        });
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "레퍼럴 application을 불러오지 못했습니다."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [canFetchInternal, page, rewardPaidFilter, searchQuery, stageFilter]);

  const markSaving = useCallback((savingKey: string, saving: boolean) => {
    const next = new Set(savingKeysRef.current);
    if (saving) next.add(savingKey);
    else next.delete(savingKey);
    savingKeysRef.current = next;
    setSavingKeys(next);
  }, []);

  const updateItem = useCallback<OpsReferralUpdateHandler>(
    async (item, field, value) => {
      const itemKey = getOpsReferralItemKey(item);
      const savingKey = getOpsReferralSavingKey(item, field);
      if (savingKeysRef.current.has(savingKey)) return false;
      markSaving(savingKey, true);
      setUpdateError("");
      try {
        const payload = await fetchWithInternalAuth<OpsReferralUpdateResponse>(
          "/api/internal/referrals",
          {
            body: JSON.stringify({
              field,
              recommendationId: item.recommendationId,
              referredUserId: item.referred.userId,
              roleId: item.roleId,
              value,
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }
        );
        setData((current) => {
          if (!current) return current;
          let removedCount = 0;
          const items = current.items.flatMap((currentItem) => {
            if (getOpsReferralItemKey(currentItem) !== itemKey) {
              return [currentItem];
            }
            const merged = mergeOpsReferralUpdate(currentItem, payload);
            const matchesStage =
              !stageFilter || merged.currentStage === stageFilter;
            const matchesRewardPaid =
              !rewardPaidFilter ||
              String(merged.rewardPaid) === rewardPaidFilter;
            if (!matchesStage || !matchesRewardPaid) {
              removedCount += 1;
              return [];
            }
            return [merged];
          });
          return {
            ...current,
            items,
            total: Math.max(0, current.total - removedCount),
          };
        });
        setSelectedReferral((current) =>
          current && getOpsReferralItemKey(current) === itemKey
            ? mergeOpsReferralUpdate(current, payload)
            : current
        );
        return true;
      } catch (updateFailure) {
        setUpdateError(
          updateFailure instanceof Error
            ? updateFailure.message
            : "변경사항을 저장하지 못했습니다."
        );
        return false;
      } finally {
        markSaving(savingKey, false);
      }
    },
    [markSaving, rewardPaidFilter, stageFilter]
  );

  const openReferral = useCallback((item: OpsReferralItem) => {
    setSelectedReferral(item);
  }, []);
  const closeReferral = useCallback(() => {
    setSelectedReferral(null);
    setUpdateError("");
  }, []);
  const updatePayoutInformation =
    useCallback<OpsReferralPayoutInformationUpdatedHandler>(
      (item, payoutInformation) => {
        const itemKey = getOpsReferralItemKey(item);
        setData((current) =>
          current
            ? {
                ...current,
                items: current.items.map((currentItem) =>
                  getOpsReferralItemKey(currentItem) === itemKey
                    ? { ...currentItem, payoutInformation }
                    : currentItem
                ),
              }
            : current
        );
        setSelectedReferral((current) =>
          current && getOpsReferralItemKey(current) === itemKey
            ? { ...current, payoutInformation }
            : current
        );
      },
      []
    );
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / OPS_REFERRALS_PAGE_SIZE)
  );
  const stageFilterOptions = useMemo(
    () => [{ id: "", label: "Stage 전체" }, ...(data?.stageOptions ?? [])],
    [data?.stageOptions]
  );
  const stageFilterLabel =
    stageFilterOptions.find((option) => option.id === stageFilter)?.label ??
    "Stage 전체";
  const rewardFilterLabel =
    REWARD_FILTER_OPTIONS.find((option) => option.id === rewardPaidFilter)
      ?.label ?? "지급 완료 여부 전체";
  const items = data?.items ?? EMPTY_REFERRAL_ITEMS;
  const hasActiveFilters = Boolean(
    searchQuery || stageFilter || rewardPaidFilter
  );

  return (
    <>
      <Head>
        <title>레퍼럴 | Harper Ops</title>
      </Head>

      <OpsShell>
        <section className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating font-normal">
          <header className="border-b border-neutral-1000-a05 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-base font-medium text-neutral-primary">
                  레퍼럴
                </h1>
                <p className="mt-1 text-[13px] font-light text-neutral-muted">
                  초대로 가입한 인재의 연결 대기 이후 내부 매칭 현황입니다.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <div className="relative w-full sm:w-[360px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                  <UiInput
                    unstyled
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="이름, 이메일, role, company 검색"
                    aria-label="이름, 이메일, role, company 검색"
                    className={cx(opsTheme.input, "h-9 pl-9 pr-9 font-normal")}
                  />
                  {searchInput && (
                    <BareButton
                      type="button"
                      onClick={() => setSearchInput("")}
                      className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary"
                      aria-label="검색어 지우기"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </BareButton>
                  )}
                </div>
                <OpsReferralFilterDropdown
                  label={stageFilterLabel}
                  value={stageFilter}
                  options={stageFilterOptions}
                  onChange={(value) => {
                    setStageFilter(value);
                    setPage(1);
                  }}
                />
                <OpsReferralFilterDropdown
                  label={rewardFilterLabel}
                  value={rewardPaidFilter}
                  options={REWARD_FILTER_OPTIONS}
                  onChange={(value) => {
                    setRewardPaidFilter(value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            {updateError && (
              <div className={cx(opsTheme.errorNotice, "mt-3")}>
                {updateError}
              </div>
            )}
          </header>

          <OpsReferralTable
            error={error}
            hasActiveFilters={hasActiveFilters}
            items={items}
            loading={loading}
            onOpen={openReferral}
            onUpdate={updateItem}
            savingKeys={savingKeys}
          />

          <footer className="flex items-center justify-between border-t border-neutral-1000-a05 px-4 py-3 font-normal">
            <span className="text-[13px] font-normal text-neutral-muted">
              총 {(data?.total ?? 0).toLocaleString()}건 · {page} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <BareButton
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || loading}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-2.5 text-[13px] font-normal"
                )}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                이전
              </BareButton>
              <BareButton
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages || loading}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-2.5 text-[13px] font-normal"
                )}
              >
                다음
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </BareButton>
            </div>
          </footer>
        </section>

        {selectedReferral && (
          <OpsReferralDetailDrawer
            item={selectedReferral}
            error={updateError}
            onClose={closeReferral}
            onPayoutInformationUpdated={updatePayoutInformation}
            onUpdate={updateItem}
            savingKeys={savingKeys}
          />
        )}
      </OpsShell>
    </>
  );
}
