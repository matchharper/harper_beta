import React from "react";
import type {
  AdminUserAnalyticsProfile,
  AdminUserAnalyticsSummary,
  AdminUserAnalyticsUser,
} from "@/components/admin/types";
import { formatDecimal } from "@/components/admin/utils";
import { Loading } from "@/components/ui/loading";
import { Input as UiInput } from "@/components/ui/input";
import { BareButton } from "@/components/ui/button";

type AdminUserAnalyticsTabProps = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void | Promise<void>;
  users: AdminUserAnalyticsUser[];
  usersLoading: boolean;
  usersError: string | null;
  selectedUser: AdminUserAnalyticsUser | null;
  onSelectUser: (user: AdminUserAnalyticsUser) => void | Promise<void>;
  summary: AdminUserAnalyticsSummary | null;
  profiles: AdminUserAnalyticsProfile[];
  detailLoading: boolean;
  detailError: string | null;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApplyDateRange: () => void | Promise<void>;
  onResetDateRange: () => void | Promise<void>;
};

function SummaryMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stroke bg-bg-floating px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-soft">
        {label}
      </div>
      <div className="mt-2 text-[24px] font-semibold text-neutral-primary">
        {value}
      </div>
    </div>
  );
}

export default function AdminUserAnalyticsTab({
  search,
  onSearchChange,
  onSearchSubmit,
  users,
  usersLoading,
  usersError,
  selectedUser,
  onSelectUser,
  summary,
  profiles,
  detailLoading,
  detailError,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApplyDateRange,
  onResetDateRange,
}: AdminUserAnalyticsTabProps) {
  return (
    <>
      <div className="mb-4 rounded-2xl border border-stroke bg-bg-weak p-4 text-neutral-primary">
        <div className="text-[14px] font-semibold">User lookup</div>
        <div className="mt-1 text-[12px] leading-5 text-neutral-muted">
          이름, 이메일, 회사명으로 유저를 찾고 채팅세션 수, 프로필 view, 프로필
          링크 클릭 지표를 확인합니다.
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <UiInput
            unstyled
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSearchSubmit();
              }
            }}
            placeholder="이름, 이메일 또는 회사명"
            className="h-11 flex-1 rounded-lg border border-stroke bg-bg-floating px-4 text-[14px] text-neutral-primary outline-none placeholder:text-neutral-placeholder"
          />
          <BareButton
            onClick={() => {
              void onSearchSubmit();
            }}
            className="h-11 rounded-lg border border-surface-inverse bg-surface-inverse px-4 text-[13px] text-on-inverse transition-colors hover:bg-surface-inverse-hover"
          >
            Search
          </BareButton>
        </div>
        {usersError ? (
          <div className="mt-3 text-[12px] text-critical">{usersError}</div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-stroke bg-bg-weak p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-neutral-primary">
                Users
              </div>
              <div className="mt-1 text-[12px] text-neutral-muted">
                {users.length}명
              </div>
            </div>
            {usersLoading ? (
              <Loading
                size="sm"
                inline={true}
                className="text-[12px] text-neutral-muted"
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {users.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stroke bg-bg-floating px-4 py-6 text-center text-[12px] leading-5 text-neutral-soft">
                {search.trim()
                  ? "일치하는 유저가 없습니다."
                  : "이름, 이메일 또는 회사명을 입력해 유저를 찾아보세요."}
              </div>
            ) : (
              users.map((user) => {
                const isSelected = selectedUser?.userId === user.userId;

                return (
                  <BareButton
                    key={user.userId}
                    type="button"
                    onClick={() => {
                      void onSelectUser(user);
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-stroke-strong bg-interaction-selected"
                        : "border-stroke bg-bg-floating hover:bg-bg-weak"
                    }`}
                  >
                    <div className="text-[13px] font-semibold text-neutral-primary">
                      {user.name || "(이름 없음)"}
                    </div>
                    <div className="mt-1 break-all text-[12px] text-neutral-muted">
                      {user.email || "-"}
                    </div>
                    <div className="mt-2 text-[11px] text-neutral-soft">
                      세션 {user.searchCount.toLocaleString("ko-KR")} · 후보{" "}
                      {user.profileViewCount.toLocaleString("ko-KR")} · 링크{" "}
                      {user.linkClickCount.toLocaleString("ko-KR")}
                    </div>
                  </BareButton>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-stroke bg-bg-weak p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-neutral-primary">
                  Summary
                </div>
                <div className="mt-1 text-[12px] text-neutral-muted">
                  {selectedUser
                    ? `${selectedUser.name || selectedUser.email || "선택된 유저"}`
                    : "유저를 먼저 선택하세요"}
                </div>
              </div>
              {detailLoading ? (
                <Loading
                  size="sm"
                  inline={true}
                  className="text-[12px] text-neutral-muted"
                />
              ) : null}
            </div>

            {selectedUser ? (
              <div className="mt-3 rounded-xl border border-stroke bg-bg-floating px-3 py-3 text-[12px] leading-5 text-neutral-muted">
                <div>{selectedUser.email || "-"}</div>
                <div>{selectedUser.company || "회사 정보 없음"}</div>
              </div>
            ) : null}

            {selectedUser ? (
              <div className="mt-3 rounded-xl border border-stroke bg-bg-floating px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-soft">
                  Date Range (KST)
                </div>
                <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                  <UiInput
                    unstyled
                    type="date"
                    value={startDate}
                    onChange={(event) => onStartDateChange(event.target.value)}
                    className="h-10 rounded-lg border border-stroke bg-bg-floating px-3 text-[13px] text-neutral-primary outline-none"
                  />
                  <div className="px-1 text-[12px] text-neutral-soft">~</div>
                  <UiInput
                    unstyled
                    type="date"
                    value={endDate}
                    onChange={(event) => onEndDateChange(event.target.value)}
                    className="h-10 rounded-lg border border-stroke bg-bg-floating px-3 text-[13px] text-neutral-primary outline-none"
                  />
                  <BareButton
                    type="button"
                    onClick={() => {
                      void onApplyDateRange();
                    }}
                    className="h-10 rounded-lg border border-surface-inverse bg-surface-inverse px-4 text-[12px] text-on-inverse transition-colors hover:bg-surface-inverse-hover"
                  >
                    적용
                  </BareButton>
                  <BareButton
                    type="button"
                    onClick={() => {
                      void onResetDateRange();
                    }}
                    className="h-10 rounded-lg border border-stroke bg-transparent px-4 text-[12px] text-neutral-muted transition-colors hover:bg-bg-weak"
                  >
                    전체
                  </BareButton>
                </div>
              </div>
            ) : null}

            {detailError ? (
              <div className="mt-3 text-[12px] text-critical">
                {detailError}
              </div>
            ) : null}

            {!selectedUser ? (
              <div className="mt-4 rounded-xl border border-dashed border-stroke bg-bg-floating px-4 py-10 text-center text-[12px] leading-5 text-neutral-soft">
                왼쪽에서 유저를 선택하면 검색/프로필 지표가 표시됩니다.
              </div>
            ) : summary ? (
              <>
                <div className="mt-4">
                  <div className="text-[12px] font-semibold text-neutral-muted">
                    기간별 지표
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <SummaryMetricCard
                      label="채팅세션 수"
                      value={summary.searchCount.toLocaleString("ko-KR")}
                    />
                    <SummaryMetricCard
                      label="검색 횟수"
                      value={summary.runCount.toLocaleString("ko-KR")}
                    />
                    <SummaryMetricCard
                      label="채팅 자체의 수"
                      value={summary.chatMessageCount.toLocaleString("ko-KR")}
                    />
                    <SummaryMetricCard
                      label="페이지 조회수"
                      value={summary.pageViewCount.toLocaleString("ko-KR")}
                    />
                    <SummaryMetricCard
                      label="프로필 본 후보자 수"
                      value={summary.uniqueProfilesViewed.toLocaleString(
                        "ko-KR"
                      )}
                    />
                    <SummaryMetricCard
                      label="링크 클릭 수"
                      value={summary.linkClickCount.toLocaleString("ko-KR")}
                    />
                    <SummaryMetricCard
                      label="페이지 / 세션"
                      value={formatDecimal(summary.pageViewsPerSearch)}
                    />
                    <SummaryMetricCard
                      label="후보자 수 / 세션"
                      value={formatDecimal(summary.profileViewsPerSearch)}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[12px] font-semibold text-neutral-muted">
                    누적 지표
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <SummaryMetricCard
                      label="마크 준 사람 수"
                      value={summary.markedCandidateCount.toLocaleString(
                        "ko-KR"
                      )}
                    />
                    <SummaryMetricCard
                      label="폴더에 넣은 사람 수"
                      value={summary.bookmarkedCandidateCount.toLocaleString(
                        "ko-KR"
                      )}
                    />
                    <SummaryMetricCard
                      label="메모 남긴 수"
                      value={summary.memoCount.toLocaleString("ko-KR")}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-2xl border border-stroke bg-bg-weak p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-neutral-primary">
                  Profiles
                </div>
                <div className="mt-1 text-[12px] text-neutral-muted">
                  {selectedUser
                    ? `프로필 view 또는 링크 클릭이 있었던 후보 ${profiles.length}명`
                    : "유저를 선택하면 프로필별 상세가 표시됩니다."}
                </div>
              </div>
              {detailLoading ? (
                <Loading
                  size="sm"
                  inline={true}
                  className="text-[12px] text-neutral-muted"
                />
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {!selectedUser ? (
                <div className="rounded-xl border border-dashed border-stroke bg-bg-floating px-4 py-8 text-center text-[12px] leading-5 text-neutral-soft">
                  왼쪽에서 유저를 선택하세요.
                </div>
              ) : profiles.length === 0 && !detailLoading ? (
                <div className="rounded-xl border border-dashed border-stroke bg-bg-floating px-4 py-8 text-center text-[12px] leading-5 text-neutral-soft">
                  프로필 view 또는 링크 클릭 데이터가 없습니다.
                </div>
              ) : (
                profiles.map((profile) => (
                  <div
                    key={profile.candidId}
                    className="rounded-xl border border-stroke bg-bg-floating px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-neutral-primary">
                          {profile.name || "(이름 없음)"}
                        </div>
                        <div className="mt-1 text-[13px] leading-6 text-neutral-muted">
                          {profile.headline || profile.candidId}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <a
                          href={profile.profileHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-lg border border-stroke bg-bg-weak px-3 text-[12px] text-neutral-primary transition-colors hover:bg-interaction-selected"
                        >
                          Harper profile
                        </a>
                        {profile.linkedinUrl ? (
                          <a
                            href={profile.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center rounded-lg border border-stroke-subtle bg-transparent px-3 text-[12px] text-neutral-muted transition-colors hover:bg-bg-weak"
                          >
                            LinkedIn
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <SummaryMetricCard
                        label="Profile Views"
                        value={profile.profileViewCount.toLocaleString("ko-KR")}
                      />
                      <SummaryMetricCard
                        label="Link Clicks"
                        value={profile.totalLinkClickCount.toLocaleString(
                          "ko-KR"
                        )}
                      />
                      <SummaryMetricCard
                        label="Link Hosts"
                        value={profile.linkClicks.length.toLocaleString(
                          "ko-KR"
                        )}
                      />
                    </div>

                    <div className="mt-4 rounded-lg border border-interaction-selected bg-bg-weak px-3 py-3 text-[13px] leading-6 text-neutral-muted">
                      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-neutral-soft">
                        Link Click Breakdown
                      </div>
                      {profile.linkClicks.length === 0 ? (
                        <div className="text-neutral-soft">
                          링크 클릭 데이터가 없습니다.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {profile.linkClicks.map((item) => (
                            <div
                              key={`${profile.candidId}-${item.host}`}
                              className="inline-flex items-center gap-2 rounded-full border border-stroke bg-bg-floating px-3 py-1 text-[12px] text-neutral-muted"
                            >
                              <span>{item.host}</span>
                              <span className="font-semibold text-neutral-primary">
                                {item.count.toLocaleString("ko-KR")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
