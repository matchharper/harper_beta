import { opsTheme } from "@/components/ops/theme";
import type { OpsReferralItem } from "@/lib/ops/referrals";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { memo } from "react";
import {
  OpsReferralAmountDropdown,
  OpsReferralDateDropdown,
  OpsReferralRewardPaidDropdown,
  OpsReferralStageDropdown,
} from "./OpsReferralEditors";
import {
  formatReferralDateOnly,
  formatReferralDateTime,
  getOpsReferralItemKey,
  getOpsReferralSavingKey,
  OpsReferralPersonCell,
} from "./shared";
import type { OpsReferralUpdateHandler } from "./types";

type ReferralTableRowProps = {
  amountSaving: boolean;
  hiredAtSaving: boolean;
  item: OpsReferralItem;
  onOpen: (item: OpsReferralItem) => void;
  onUpdate: OpsReferralUpdateHandler;
  rewardPaidAtSaving: boolean;
  rewardPaidSaving: boolean;
  settlementCompletedAtSaving: boolean;
  stageSaving: boolean;
};

const ReferralTableRow = memo(function ReferralTableRow({
  amountSaving,
  hiredAtSaving,
  item,
  onOpen,
  onUpdate,
  rewardPaidAtSaving,
  rewardPaidSaving,
  settlementCompletedAtSaving,
  stageSaving,
}: ReferralTableRowProps) {
  return (
    <tr
      tabIndex={0}
      role="button"
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }}
      className="cursor-pointer font-normal outline-none transition hover:bg-bg-weak/70 focus-visible:bg-bg-weak"
    >
      <td className="px-4 py-2 align-middle">
        <OpsReferralPersonCell person={item.referred} />
      </td>
      <td className="px-4 py-2 align-middle">
        <OpsReferralPersonCell person={item.referrer} />
      </td>
      <td className="px-4 py-2 align-middle">
        <div className="truncate text-sm font-medium text-neutral-primary">
          {item.roleName}
        </div>
        <div className="mt-1 truncate text-[13px] font-normal text-neutral-muted">
          {item.companyName}
        </div>
      </td>
      <td className="px-4 py-2 align-middle">
        <OpsReferralStageDropdown
          item={item}
          saving={stageSaving}
          onChange={(value) => onUpdate(item, "stage", value)}
        />
      </td>
      <td className="px-4 py-2 text-[13px] font-normal text-neutral-muted">
        {formatReferralDateTime(item.recommendedAt)}
      </td>
      <td className="px-4 py-2">
        <OpsReferralDateDropdown
          label="입사일"
          value={item.hiredAt}
          saving={hiredAtSaving}
          onChange={(value) => onUpdate(item, "hiredAt", value)}
        />
      </td>
      <td className="px-4 py-2">
        <OpsReferralDateDropdown
          label="정산완료일"
          value={item.settlementCompletedAt}
          saving={settlementCompletedAtSaving}
          onChange={(value) => onUpdate(item, "settlementCompletedAt", value)}
        />
      </td>
      <td className="px-4 py-2 text-[13px] font-normal text-neutral-muted">
        {formatReferralDateOnly(item.rewardDueAt)}
      </td>
      <td className="px-4 py-2">
        <OpsReferralRewardPaidDropdown
          value={item.rewardPaid}
          saving={rewardPaidSaving}
          onChange={(value) => onUpdate(item, "rewardPaid", value)}
        />
      </td>
      <td className="px-4 py-2">
        <OpsReferralDateDropdown
          label="보상지급일"
          value={item.rewardPaidAt}
          saving={rewardPaidAtSaving}
          onChange={(value) => onUpdate(item, "rewardPaidAt", value)}
        />
      </td>
      <td className="px-4 py-2">
        <OpsReferralAmountDropdown
          value={item.amount}
          saving={amountSaving}
          onChange={(value) => onUpdate(item, "amount", value)}
        />
      </td>
      <td className="px-3 text-right">
        <ChevronRight className="h-4 w-4 text-neutral-soft" />
      </td>
    </tr>
  );
});

export const OpsReferralTable = memo(function OpsReferralTable({
  error,
  hasActiveFilters,
  items,
  loading,
  onOpen,
  onUpdate,
  savingKeys,
}: {
  error: string;
  hasActiveFilters: boolean;
  items: OpsReferralItem[];
  loading: boolean;
  onOpen: (item: OpsReferralItem) => void;
  onUpdate: OpsReferralUpdateHandler;
  savingKeys: ReadonlySet<string>;
}) {
  const isSaving = (item: OpsReferralItem, field: string) =>
    savingKeys.has(getOpsReferralSavingKey(item, field));

  return (
    <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-1000-a05 scrollbar-track-neutral-1000-a05">
      <table className="min-w-[1980px] border-collapse text-left font-normal">
        <thead>
          <tr className="border-b border-neutral-1000-a10 bg-bg-default/60 text-[13px] font-normal text-neutral-soft">
            <th className="w-[220px] px-4 py-3 font-normal">가입한 사람</th>
            <th className="w-[220px] px-4 py-3 font-normal">초대한 사람</th>
            <th className="w-[260px] px-4 py-3 font-normal">Role at company</th>
            <th className="w-[190px] px-4 py-3 font-normal">Status</th>
            <th className="w-[120px] px-4 py-3 font-normal">추천 날짜</th>
            <th className="w-[132px] px-4 py-3 font-normal">입사일</th>
            <th className="w-[132px] px-4 py-3 font-normal">정산완료일</th>
            <th className="w-[145px] px-4 py-3 font-normal">보상지급 예정일</th>
            <th className="w-[154px] px-4 py-3 font-normal">
              보상지급완료여부
            </th>
            <th className="w-[132px] px-4 py-3 font-normal">보상지급일</th>
            <th className="w-[180px] px-4 py-3 font-normal">금액</th>
            <th className="w-10 px-3 py-3 font-normal">
              <span className="sr-only">상세</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-1000-a05">
          {loading ? (
            <tr>
              <td colSpan={12} className="px-4 py-16 text-center">
                <span className="inline-flex items-center gap-2 text-sm font-normal text-neutral-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  불러오는 중...
                </span>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={12} className="p-4">
                <div className={opsTheme.errorNotice}>{error}</div>
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td
                colSpan={12}
                className="px-4 py-16 text-center text-sm font-normal text-neutral-muted"
              >
                {hasActiveFilters
                  ? "검색 결과가 없습니다."
                  : "연결 대기 이후의 레퍼럴 application이 없습니다."}
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <ReferralTableRow
                key={getOpsReferralItemKey(item)}
                item={item}
                onOpen={onOpen}
                onUpdate={onUpdate}
                amountSaving={isSaving(item, "amount")}
                hiredAtSaving={isSaving(item, "hiredAt")}
                rewardPaidAtSaving={isSaving(item, "rewardPaidAt")}
                rewardPaidSaving={isSaving(item, "rewardPaid")}
                settlementCompletedAtSaving={isSaving(
                  item,
                  "settlementCompletedAt"
                )}
                stageSaving={isSaving(item, "stage")}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
});
