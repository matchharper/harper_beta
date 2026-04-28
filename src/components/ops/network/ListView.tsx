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

type ListViewProps = {
  currentLeads: NetworkLeadSummary[];
  currentPage: number;
  cvOnly: boolean;
  isLoading: boolean;
  list: NetworkLeadListResponse | undefined;
  listError: string | null;
  moveFilter: string;
  moveOptions: string[];
  onCvOnlyChange: (value: boolean) => void;
  onGoToPage: (page: number) => void;
  onMoveFilterChange: (value: string) => void;
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
  moveFilter,
  moveOptions,
  onCvOnlyChange,
  onGoToPage,
  onMoveFilterChange,
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
          value={String(stats.readyNowCount)}
          hint="좋은 기회면 바로 이직 가능"
        />
        <StatCard
          value={String(stats.withCvCount)}
          hint="CV 또는 이력서 파일 포함"
        />
        <StatCard value={String(stats.recentCount)} hint="최근 7일 신규 제출" />
      </section>

      <section className="space-y-6">
        <div className="px-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_180px_220px_160px_160px_auto]">
            <label
              className={cx(
                opsTheme.panelSoft,
                "flex h-11 items-center gap-2 px-3"
              )}
            >
              <Search className="h-4 w-4 text-beige900/40" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="이름, 이메일, 역할, 링크 검색"
                className="h-full w-full bg-transparent font-geist text-sm text-beige900 outline-none placeholder:text-beige900/35"
              />
            </label>

            <select
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
            </select>

            <select
              value={moveFilter}
              onChange={(event) => onMoveFilterChange(event.target.value)}
              className={cx(opsTheme.input, "appearance-none")}
            >
              <option value="all">모든 이직 의향</option>
              {moveOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label
              className={cx(
                opsTheme.panelSoft,
                "flex h-11 items-center gap-2 px-3 font-geist text-sm text-beige900/70"
              )}
            >
              <input
                type="checkbox"
                checked={cvOnly}
                onChange={(event) => onCvOnlyChange(event.target.checked)}
                className="accent-[#2E1706]"
              />
              CV만 보기
            </label>

            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className={cx(opsTheme.input, "appearance-none")}
            >
              {OPS_NETWORK_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  페이지당 {option}명
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onResetFilters}
              className={cx(opsTheme.buttonSoft, "h-11")}
            >
              필터 초기화
            </button>
          </div>
        </div>

        {listError ? (
          <div className={opsTheme.errorNotice}>{listError}</div>
        ) : null}

        <div className={cx(opsTheme.panel, "overflow-hidden")}>
          <div className="flex flex-col gap-3 border-b border-beige900/10 px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className={opsTheme.eyebrow}>Candidates</div>
              <div className="mt-1 font-geist text-sm text-beige900/70">
                필터 결과 {list?.filteredCount ?? 0}명 / 전체{" "}
                {list?.allCount ?? 0}명
              </div>
            </div>
            <div className="font-geist text-sm text-beige900/55">
              페이지 {currentPage} / {totalPages} · 현재 {currentLeads.length}명
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1680px] w-full table-fixed border-collapse">
              <thead className="bg-white/55 text-left">
                <tr className="border-b border-beige900/10 font-geist text-xs uppercase text-beige900/50">
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
                        <LoaderCircle className="h-5 w-5 animate-spin text-beige900/45" />
                      </div>
                    </td>
                  </tr>
                ) : currentLeads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center font-geist text-sm text-beige900/55"
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
                          "cursor-pointer border-b border-beige900/10 align-top transition hover:bg-white/50 focus-visible:bg-white/60",
                          isSelected && "bg-[#2E1706] text-beige100"
                        )}
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="min-w-0">
                            <div className="truncate font-geist text-base font-medium">
                              {lead.name ?? "이름 없음"}
                            </div>
                            <div
                              className={cx(
                                "mt-1 truncate font-geist text-sm",
                                isSelected
                                  ? "text-beige100/70"
                                  : "text-beige900/55"
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
                          <div className="font-geist text-sm font-medium">
                            {latestExperience.primary}
                          </div>
                          <div
                            className={cx(
                              "mt-2 font-geist text-xs",
                              isSelected
                                ? "text-beige100/65"
                                : "text-beige900/55"
                            )}
                          >
                            {latestExperience.meta ?? "세부 경력 정보 없음"}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            {preferenceLabels.moveLabel ? (
                              <Badge tone={isSelected ? "inverse" : "default"}>
                                {preferenceLabels.moveLabel}
                              </Badge>
                            ) : null}
                            {preferenceLabels.engagementLabels.map((label) => (
                              <Badge
                                key={`${lead.id}-engagement-${label}`}
                                tone={isSelected ? "inverse" : "default"}
                              >
                                {label}
                              </Badge>
                            ))}
                            {preferenceLabels.locationLabels.map((label) => (
                              <Badge
                                key={`${lead.id}-location-${label}`}
                                tone={isSelected ? "inverse" : "default"}
                              >
                                {label}
                              </Badge>
                            ))}
                            {!preferenceLabels.moveLabel &&
                            preferenceLabels.engagementLabels.length === 0 &&
                            preferenceLabels.locationLabels.length === 0 ? (
                              <span
                                className={cx(
                                  "font-geist text-sm",
                                  isSelected
                                    ? "text-beige100/65"
                                    : "text-beige900/50"
                                )}
                              >
                                저장된 선택 값 없음
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenQuickMemo(lead);
                              }}
                              className="inline-flex h-8 items-center justify-center rounded-md bg-beige900 px-3 font-geist text-xs text-beige100 transition hover:opacity-90"
                            >
                              메모 추가
                            </button>
                            {lead.recentMemos.length > 0 ? (
                              <div className="space-y-3">
                                {lead.recentMemos.map((memo) => (
                                  <div key={memo.id}>
                                    <div
                                      className={cx(
                                        "font-geist text-xs",
                                        isSelected
                                          ? "text-beige100/60"
                                          : "text-beige900/45"
                                      )}
                                    >
                                      {formatKstDate(memo.createdAt)}
                                    </div>
                                    <div className="mt-1 line-clamp-2 font-geist text-sm leading-6">
                                      {memo.content}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div
                                className={cx(
                                  "font-geist text-sm",
                                  isSelected
                                    ? "text-beige100/65"
                                    : "text-beige900/50"
                                )}
                              >
                                최근 메모 없음
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="font-geist text-sm">
                            {formatKstDate(lead.createdAt)}
                          </div>
                          <div
                            className={cx(
                              "mt-2 font-geist text-xs",
                              isSelected
                                ? "text-beige100/60"
                                : "text-beige900/45"
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

          <div className="flex flex-col gap-3 border-t border-beige900/10 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="font-geist text-sm text-beige900/55">
              페이지당 {pageSize}명
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onGoToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className={cx(opsTheme.buttonSoft, "h-10 px-3")}
              >
                <ChevronLeft className="h-4 w-4" />
                이전
              </button>
              {pageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => onGoToPage(page)}
                  className={cx(
                    "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 font-geist text-sm transition",
                    page === currentPage
                      ? "bg-beige900 text-beige100"
                      : "bg-white/60 text-beige900 hover:bg-white/80"
                  )}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onGoToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={cx(opsTheme.buttonSoft, "h-10 px-3")}
              >
                다음
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
