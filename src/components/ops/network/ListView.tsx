import { cx, opsTheme } from "@/components/ops/theme";
import { OPS_NETWORK_PAGE_SIZE_OPTIONS } from "@/store/useOpsNetworkStore";
import type {
  NetworkLeadListResponse,
  NetworkLeadListStats,
  NetworkLeadSummary,
} from "@/lib/opsNetwork";
import { ChevronLeft, ChevronRight, LoaderCircle, Search } from "lucide-react";
import {
  Badge,
  daysAgo,
  formatKstDate,
  getLatestExperienceText,
  getLeadPreferenceLabels,
  NetworkLeadProgressTrack,
  onEnterOrSpace,
  StatCard,
} from "./shared";
import { Input as UiInput } from "@/components/ui/input";
import { Select as UiSelect } from "@/components/ui/select";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import { BareButton } from "@/components/ui/button";

type ListViewProps = {
  currentLeads: NetworkLeadSummary[];
  currentPage: number;
  cvOnly: boolean;
  isLoading: boolean;
  list: NetworkLeadListResponse | undefined;
  listError: string | null;
  onCvOnlyChange: (value: boolean) => void;
  onGoToPage: (page: number) => void;
  onOpenLeadDrawer: (leadId: number) => void;
  onOpenQuickMemo: (lead: NetworkLeadSummary) => void;
  onPageSizeChange: (value: number) => void;
  onQueryChange: (value: string) => void;
  onResetFilters: () => void;
  onRoleFilterChange: (value: string) => void;
  pageNumbers: number[];
  pageSize: number;
  query: string;
  roleFilter: string;
  roleOptions: string[];
  selectedLeadId: number | null;
  stats: NetworkLeadListStats;
  totalPages: number;
};

export default function ListView({
  currentLeads,
  currentPage,
  cvOnly,
  isLoading,
  list,
  listError,
  onCvOnlyChange,
  onGoToPage,
  onOpenLeadDrawer,
  onOpenQuickMemo,
  onPageSizeChange,
  onQueryChange,
  onResetFilters,
  onRoleFilterChange,
  pageNumbers,
  pageSize,
  query,
  roleFilter,
  roleOptions,
  selectedLeadId,
  stats,
  totalPages,
}: ListViewProps) {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          value={String(stats.totalCount)}
          hint="현재 waitlist 전체 수"
        />
        <StatCard
          value={String(stats.withCvCount)}
          hint="CV 또는 이력서 파일 포함"
        />
        <StatCard value={String(stats.recentCount)} hint="최근 7일 신규 제출" />
      </section>

      <section className="space-y-6">
        <div className="px-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_180px_160px_160px_auto]">
            <label
              className={cx(
                opsTheme.panelSoft,
                "flex h-11 items-center gap-2 px-3"
              )}
            >
              <Search className="h-4 w-4 text-neutral-soft" />
              <UiInput
                unstyled
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="이름, 이메일, 역할, 링크 검색"
                className="h-full w-full bg-transparent text-sm text-neutral-primary outline-none placeholder:text-neutral-placeholder"
              />
            </label>

            <UiSelect
              unstyled
              value={roleFilter}
              onChange={(event) => onRoleFilterChange(event.target.value)}
              className={cx(opsTheme.input, "appearance-none")}
            >
              <option value="all">모든 역할</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </UiSelect>

            <label
              className={cx(
                opsTheme.panelSoft,
                "flex h-11 items-center gap-2 px-3 text-sm text-neutral-muted"
              )}
            >
              <UiCheckbox
                unstyled
                checked={cvOnly}
                onChange={(event) => onCvOnlyChange(event.target.checked)}
                className="accent-black"
              />
              CV만 보기
            </label>

            <UiSelect
              unstyled
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className={cx(opsTheme.input, "appearance-none")}
            >
              {OPS_NETWORK_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  페이지당 {option}명
                </option>
              ))}
            </UiSelect>

            <BareButton
              type="button"
              onClick={onResetFilters}
              className={cx(opsTheme.buttonSoft, "h-11")}
            >
              필터 초기화
            </BareButton>
          </div>
        </div>

        {listError ? (
          <div className={opsTheme.errorNotice}>{listError}</div>
        ) : null}

        <div className={cx(opsTheme.panel, "overflow-hidden")}>
          <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className={opsTheme.eyebrow}>Candidates</div>
              <div className="mt-1 text-sm text-neutral-muted">
                필터 결과 {list?.filteredCount ?? 0}명 / 전체{" "}
                {list?.allCount ?? 0}명
              </div>
            </div>
            <div className="text-sm text-neutral-muted">
              페이지 {currentPage} / {totalPages} · 현재 {currentLeads.length}명
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1680px] w-full table-fixed border-collapse">
              <thead className="bg-bg-default/55 text-left">
                <tr className="border-b border-neutral-1000-a05 text-xs uppercase text-neutral-muted">
                  <th className="w-[240px] px-4 py-3 font-medium">이름</th>
                  <th className="w-[280px] px-4 py-3 font-medium">
                    최근 회사 / 역할
                  </th>
                  <th className="w-[320px] px-4 py-3 font-medium">선택한 값</th>
                  <th className="w-[360px] px-4 py-3 font-medium">메모</th>
                  <th className="w-[160px] px-4 py-3 font-medium">가입일</th>
                  <th className="w-[320px] px-4 py-3 font-medium">
                    온보딩 단계
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && !list ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12">
                      <div className="flex items-center justify-center">
                        <LoaderCircle className="h-5 w-5 animate-spin text-neutral-muted" />
                      </div>
                    </td>
                  </tr>
                ) : currentLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-neutral-muted"
                    >
                      조건에 맞는 후보자가 없습니다.
                    </td>
                  </tr>
                ) : (
                  currentLeads.map((lead) => {
                    const isSelected = selectedLeadId === lead.id;
                    const latestExperience = getLatestExperienceText(lead);
                    const preferenceLabels = getLeadPreferenceLabels(lead);
                    const submittedDaysAgo = daysAgo(lead.submittedAt);

                    return (
                      <tr
                        key={lead.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpenLeadDrawer(lead.id)}
                        onKeyDown={(event) =>
                          onEnterOrSpace(event, () => onOpenLeadDrawer(lead.id))
                        }
                        className={cx(
                          "cursor-pointer border-b border-neutral-1000-a05 align-top transition hover:bg-bg-default/50 focus-visible:bg-bg-default/60",
                          isSelected && "bg-black text-neutral-00"
                        )}
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="min-w-0">
                            <div className="truncate text-base font-medium">
                              {lead.name ?? "이름 없음"}
                            </div>
                            <div
                              className={cx(
                                "mt-1 truncate text-sm",
                                isSelected
                                  ? "text-neutral-00/70"
                                  : "text-neutral-muted"
                              )}
                            >
                              {lead.email ?? "이메일 없음"}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {lead.hasCv ? (
                                <Badge
                                  tone={isSelected ? "inverse" : "default"}
                                >
                                  CV
                                </Badge>
                              ) : null}
                              {lead.hasStructuredProfile ? (
                                <Badge
                                  tone={isSelected ? "inverse" : "default"}
                                >
                                  Structured
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-medium">
                            {latestExperience.primary}
                          </div>
                          <div
                            className={cx(
                              "mt-2 text-xs",
                              isSelected
                                ? "text-neutral-00/65"
                                : "text-neutral-muted"
                            )}
                          >
                            {latestExperience.meta ?? "세부 경력 정보 없음"}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            {preferenceLabels.engagementLabels.map((label) => (
                              <Badge
                                key={`${lead.id}-engagement-${label}`}
                                tone={isSelected ? "inverse" : "default"}
                              >
                                {label}
                              </Badge>
                            ))}
                            {preferenceLabels.engagementLabels.length === 0 ? (
                              <span
                                className={cx(
                                  "text-sm",
                                  isSelected
                                    ? "text-neutral-00/65"
                                    : "text-neutral-muted"
                                )}
                              >
                                저장된 선택 값 없음
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-3">
                            <BareButton
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenQuickMemo(lead);
                              }}
                              className="inline-flex h-8 items-center justify-center rounded-md bg-black px-3 text-xs text-neutral-00 transition hover:opacity-90"
                            >
                              메모 추가
                            </BareButton>
                            {lead.recentMemos.length > 0 ? (
                              <div className="space-y-3">
                                {lead.recentMemos.map((memo) => (
                                  <div key={memo.id}>
                                    <div
                                      className={cx(
                                        "text-xs",
                                        isSelected
                                          ? "text-neutral-00/60"
                                          : "text-neutral-muted"
                                      )}
                                    >
                                      {formatKstDate(memo.createdAt)}
                                    </div>
                                    <div className="mt-1 line-clamp-2 text-sm leading-6">
                                      {memo.content}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                className={cx(
                                  "text-sm",
                                  isSelected
                                    ? "text-neutral-00/65"
                                    : "text-neutral-muted"
                                )}
                              >
                                최근 메모 없음
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm">
                            {formatKstDate(lead.createdAt)}
                          </div>
                          <div
                            className={cx(
                              "mt-2 text-xs",
                              isSelected
                                ? "text-neutral-00/60"
                                : "text-neutral-muted"
                            )}
                          >
                            {submittedDaysAgo !== null
                              ? `${submittedDaysAgo}일 전 제출`
                              : formatKstDate(lead.submittedAt)}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <NetworkLeadProgressTrack
                            progress={lead.progress}
                            selected={isSelected}
                            structuredReady={lead.hasStructuredProfile}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-neutral-1000-a05 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-neutral-muted">
              페이지당 {pageSize}명
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BareButton
                type="button"
                onClick={() => onGoToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className={cx(opsTheme.buttonSoft, "h-10 px-3")}
              >
                <ChevronLeft className="h-4 w-4" />
                이전
              </BareButton>
              {pageNumbers.map((page) => (
                <BareButton
                  key={page}
                  type="button"
                  onClick={() => onGoToPage(page)}
                  className={cx(
                    "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm transition",
                    page === currentPage
                      ? "bg-black text-neutral-00"
                      : "bg-bg-default/60 text-neutral-primary hover:bg-bg-default/80"
                  )}
                >
                  {page}
                </BareButton>
              ))}
              <BareButton
                type="button"
                onClick={() => onGoToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={cx(opsTheme.buttonSoft, "h-10 px-3")}
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </BareButton>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
