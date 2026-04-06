import React from "react";
import type {
  AdminUserAnalyticsProfile,
  AdminUserAnalyticsSummary,
  AdminUserAnalyticsUser,
} from "@/components/admin/types";
import { formatDecimal } from "@/components/admin/utils";
import { Loading } from "@/components/ui/loading";

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

function SummaryMetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
        {label}
      </div>
      <div className="mt-2 text-[24px] font-semibold text-[#3f301f]">{value}</div>
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
      <div className="mb-4 rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4 text-[#4d3a24]">
        <div className="text-[14px] font-semibold">User lookup</div>
        <div className="mt-1 text-[12px] leading-5 text-[#7a664b]">
          이름, 이메일, 회사명으로 유저를 찾고 채팅세션 수, 프로필 view, 프로필
          링크 클릭 지표를 확인합니다.
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSearchSubmit();
              }
            }}
            placeholder="이름, 이메일 또는 회사명"
            className="h-11 flex-1 rounded-[14px] border border-[#d8c7aa] bg-[#fffaf1] px-4 text-[14px] text-[#3f301f] outline-none placeholder:text-[#9e8b6d]"
          />
          <button
            onClick={() => {
              void onSearchSubmit();
            }}
            className="h-11 rounded-[14px] border border-[#5d4931] bg-[#5d4931] px-4 text-[13px] text-[#fff8ef] transition-colors hover:bg-[#4f3e29]"
          >
            Search
          </button>
        </div>
        {usersError ? (
          <div className="mt-3 text-[12px] text-[#8d3a24]">{usersError}</div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[#4d3a24]">
                Users
              </div>
              <div className="mt-1 text-[12px] text-[#7a664b]">{users.length}명</div>
            </div>
            {usersLoading ? (
              <Loading
                size="sm"
                inline={true}
                className="text-[12px] text-[#7a664b]"
              />
            ) : null}
          </div>

          <div className="mt-4 space-y-2">
            {users.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-6 text-center text-[12px] leading-5 text-[#8d7a5d]">
                {search.trim()
                  ? "일치하는 유저가 없습니다."
                  : "이름, 이메일 또는 회사명을 입력해 유저를 찾아보세요."}
              </div>
            ) : (
              users.map((user) => {
                const isSelected = selectedUser?.userId === user.userId;

                return (
                  <button
                    key={user.userId}
                    type="button"
                    onClick={() => {
                      void onSelectUser(user);
                    }}
                    className={`w-full rounded-[16px] border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-[#8e7554] bg-[#efe1c8]"
                        : "border-[#dcccad] bg-[#fffaf1] hover:bg-[#f4eadb]"
                    }`}
                  >
                    <div className="text-[13px] font-semibold text-[#3f301f]">
                      {user.name || "(이름 없음)"}
                    </div>
                    <div className="mt-1 break-all text-[12px] text-[#7a664b]">
                      {user.email || "-"}
                    </div>
                    <div className="mt-2 text-[11px] text-[#8d7a5d]">
                      세션 {user.searchCount.toLocaleString("ko-KR")} · 후보{" "}
                      {user.profileViewCount.toLocaleString("ko-KR")} · 링크{" "}
                      {user.linkClickCount.toLocaleString("ko-KR")}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-[#4d3a24]">
                  Summary
                </div>
                <div className="mt-1 text-[12px] text-[#7a664b]">
                  {selectedUser
                    ? `${selectedUser.name || selectedUser.email || "선택된 유저"}`
                    : "유저를 먼저 선택하세요"}
                </div>
              </div>
              {detailLoading ? (
                <Loading
                  size="sm"
                  inline={true}
                  className="text-[12px] text-[#7a664b]"
                />
              ) : null}
            </div>

            {selectedUser ? (
              <div className="mt-3 rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-3 py-3 text-[12px] leading-5 text-[#6a563c]">
                <div>{selectedUser.email || "-"}</div>
                <div>{selectedUser.company || "회사 정보 없음"}</div>
              </div>
            ) : null}

            {selectedUser ? (
              <div className="mt-3 rounded-[16px] border border-[#dcccad] bg-[#fffaf1] px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                  Date Range (KST)
                </div>
                <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => onStartDateChange(event.target.value)}
                    className="h-10 rounded-[12px] border border-[#d8c7aa] bg-[#fffaf1] px-3 text-[13px] text-[#3f301f] outline-none"
                  />
                  <div className="px-1 text-[12px] text-[#8d7a5d]">~</div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => onEndDateChange(event.target.value)}
                    className="h-10 rounded-[12px] border border-[#d8c7aa] bg-[#fffaf1] px-3 text-[13px] text-[#3f301f] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void onApplyDateRange();
                    }}
                    className="h-10 rounded-[12px] border border-[#5d4931] bg-[#5d4931] px-4 text-[12px] text-[#fff8ef] transition-colors hover:bg-[#4f3e29]"
                  >
                    적용
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void onResetDateRange();
                    }}
                    className="h-10 rounded-[12px] border border-[#dcccad] bg-transparent px-4 text-[12px] text-[#6a563c] transition-colors hover:bg-[#f4eadb]"
                  >
                    전체
                  </button>
                </div>
              </div>
            ) : null}

            {detailError ? (
              <div className="mt-3 text-[12px] text-[#8d3a24]">{detailError}</div>
            ) : null}

            {!selectedUser ? (
              <div className="mt-4 rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-10 text-center text-[12px] leading-5 text-[#8d7a5d]">
                왼쪽에서 유저를 선택하면 검색/프로필 지표가 표시됩니다.
              </div>
            ) : summary ? (
              <>
                <div className="mt-4">
                  <div className="text-[12px] font-semibold text-[#6a563c]">
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
                      value={summary.uniqueProfilesViewed.toLocaleString("ko-KR")}
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
                  <div className="text-[12px] font-semibold text-[#6a563c]">
                    누적 지표
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <SummaryMetricCard
                      label="마크 준 사람 수"
                      value={summary.markedCandidateCount.toLocaleString("ko-KR")}
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

          <div className="rounded-[20px] border border-[#d8c7aa] bg-[#fbf4e8] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-[#4d3a24]">
                  Profiles
                </div>
                <div className="mt-1 text-[12px] text-[#7a664b]">
                  {selectedUser
                    ? `프로필 view 또는 링크 클릭이 있었던 후보 ${profiles.length}명`
                    : "유저를 선택하면 프로필별 상세가 표시됩니다."}
                </div>
              </div>
              {detailLoading ? (
                <Loading
                  size="sm"
                  inline={true}
                  className="text-[12px] text-[#7a664b]"
                />
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {!selectedUser ? (
                <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                  왼쪽에서 유저를 선택하세요.
                </div>
              ) : profiles.length === 0 && !detailLoading ? (
                <div className="rounded-[16px] border border-dashed border-[#d8c7aa] bg-[#fffaf1] px-4 py-8 text-center text-[12px] leading-5 text-[#8d7a5d]">
                  프로필 view 또는 링크 클릭 데이터가 없습니다.
                </div>
              ) : (
                profiles.map((profile) => (
                  <div
                    key={profile.candidId}
                    className="rounded-[18px] border border-[#dcccad] bg-[#fffaf1] px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold text-[#3f301f]">
                          {profile.name || "(이름 없음)"}
                        </div>
                        <div className="mt-1 text-[13px] leading-6 text-[#6a563c]">
                          {profile.headline || profile.candidId}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <a
                          href={profile.profileHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-[12px] border border-[#cfbb9a] bg-[#f4eadb] px-3 text-[12px] text-[#4d3a24] transition-colors hover:bg-[#eadcc7]"
                        >
                          Harper profile
                        </a>
                        {profile.linkedinUrl ? (
                          <a
                            href={profile.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center rounded-[12px] border border-[#e0d0b6] bg-transparent px-3 text-[12px] text-[#6a563c] transition-colors hover:bg-[#f4eadb]"
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
                        value={profile.linkClicks.length.toLocaleString("ko-KR")}
                      />
                    </div>

                    <div className="mt-4 rounded-[14px] border border-[#eadcc7] bg-[#f7efe2] px-3 py-3 text-[13px] leading-6 text-[#5b4932]">
                      <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#9a8667]">
                        Link Click Breakdown
                      </div>
                      {profile.linkClicks.length === 0 ? (
                        <div className="text-[#8d7a5d]">
                          링크 클릭 데이터가 없습니다.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {profile.linkClicks.map((item) => (
                            <div
                              key={`${profile.candidId}-${item.host}`}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dcccad] bg-[#fffaf1] px-3 py-1 text-[12px] text-[#6a563c]"
                            >
                              <span>{item.host}</span>
                              <span className="font-semibold text-[#3f301f]">
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
