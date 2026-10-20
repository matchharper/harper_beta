import { CompanyActivityPanel } from "@/components/ops/company/CompanyActivityPanel";
import { CompanyDirectoryRow } from "@/components/ops/company/CompanyDirectoryRow";
import {
  CompanyEditSheet,
  type CompanyEditDraft,
  workspaceToCompanyEditDraft,
} from "@/components/ops/company/CompanyEditSheet";
import {
  CompanyAnalytics,
  useCompanyDashboard,
} from "@/components/ops/company/CompanyAnalytics";
import { CompanyConversationsTab } from "@/components/ops/company/CompanyConversationsTab";
import { CompanyRolesOverview } from "@/components/ops/company/CompanyRolesOverview";
import { EmptyState } from "@/components/ops/opportunities/shared";
import { formatOpsCompanyDate } from "@/components/ops/dateUtils";
import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { MuteButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { TabBoxes } from "@/components/ui/tab-boxes";
import {
  useOpsCompanyMembers,
  useUpdateOpsCompanyWorkspace,
} from "@/hooks/ops/useOpsCompany";
import { useOpsOpportunityCatalogController } from "@/hooks/ops/useOpsOpportunityCatalogController";
import { isInternalEmail } from "@/lib/internalAccess";
import { queryKeys } from "@/lib/queryKeys";
import type { OpsCompanyMemberRecord } from "@/lib/ops/company";
import type { OpsOpportunityWorkspaceRecord } from "@/lib/ops/opportunity";
import { useAuthStore } from "@/store/useAuthStore";
import {
  ChevronDown,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useState } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { OpsOpportunityCatalogResponse } from "@/lib/ops/opportunity";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";

type CompanyDetailTab = "roles" | "members" | "activity" | "conversations";

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCompanyPagePath(args: {
  tab: CompanyDetailTab;
  workspaceId?: string | null;
}) {
  const params = new URLSearchParams();
  const workspaceId = String(args.workspaceId ?? "").trim();
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (args.tab !== "roles") params.set("tab", args.tab);
  const query = params.toString();
  return query ? `/ops/company?${query}` : "/ops/company";
}

function Avatar({ member }: { member: OpsCompanyMemberRecord }) {
  const initials = (member.name || member.email || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  if (member.profilePicture) {
    return (
      <span
        aria-hidden="true"
        className="h-9 w-9 rounded-full object-cover"
        style={{
          backgroundImage: `url(${member.profilePicture})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-weak text-xs font-medium text-neutral-muted">
      {initials}
    </div>
  );
}

function MemberRow({ member }: { member: OpsCompanyMemberRecord }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-neutral-1000-a05 py-3 last:border-b-0">
      <Avatar member={member} />
      <div className="min-w-0">
        <div className="break-words text-sm font-medium text-neutral-primary">
          {member.name || "이름 없음"}
        </div>
        <div className="break-all text-xs text-neutral-muted">
          {member.email || member.userId}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-muted">
          {member.role && <span>{member.role}</span>}
          <span>가입 {formatOpsCompanyDate(member.joinedAt)}</span>
        </div>
      </div>
    </div>
  );
}

export default function OpsCompanyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [editingCompanyWorkspaceId, setEditingCompanyWorkspaceId] = useState<
    string | null
  >(null);
  const [initialCompanyDraft, setInitialCompanyDraft] =
    useState<CompanyEditDraft | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyEditDraft | null>(
    null
  );
  const [memberSearch, setMemberSearch] = useState("");
  const [appliedMemberSearch, setAppliedMemberSearch] = useState("");

  const catalog = useOpsOpportunityCatalogController({
    canFetchInternal,
    loadRoles: false,
    excludeTailoredRoles: true,
  });
  const updateCompanyWorkspace = useUpdateOpsCompanyWorkspace();
  const queryWorkspaceId = router.isReady
    ? getQueryText(router.query.workspaceId)
    : "";
  const activeTab: CompanyDetailTab = "activity";

  const detailQuery = useQuery({
    queryKey: ["opsCompany", "detail", queryWorkspaceId],
    enabled: canFetchInternal && Boolean(queryWorkspaceId),
    staleTime: 15_000,
    queryFn: () =>
      fetchWithInternalAuth<OpsOpportunityCatalogResponse>(
        `/api/internal/opportunities/catalog?internalOnly=true&excludeTailoredRoles=true&workspaceId=${encodeURIComponent(queryWorkspaceId)}`
      ),
  });
  const selectedWorkspace = queryWorkspaceId
    ? (detailQuery.data?.workspaces[0] ??
      catalog.workspaces.find(
        (w) => w.companyWorkspaceId === queryWorkspaceId
      ) ??
      null)
    : null;
  const selectedWorkspaceId = queryWorkspaceId || null;
  const view = router.query.view === "statistics" ? "statistics" : "companies";
  const dashboard = useCompanyDashboard(
    canFetchInternal &&
      !queryWorkspaceId &&
      view === "companies" &&
      catalog.workspaces.length > 0,
    90,
    undefined,
    catalog.workspaces.map((w) => w.companyWorkspaceId)
  );

  const membersQuery = useOpsCompanyMembers({
    enabled: canFetchInternal && Boolean(selectedWorkspaceId),
    query: appliedMemberSearch,
    workspaceId: selectedWorkspaceId,
  });
  const handleRefresh = () => {
    void catalog.refetchCatalog();
    void queryClient.invalidateQueries({ queryKey: queryKeys.opsCompany.all });
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    setAppliedMemberSearch("");
    setMemberSearch("");
    catalog.onWorkspaceSelect(workspaceId);
    void router.push(
      buildCompanyPagePath({ tab: activeTab, workspaceId }),
      undefined,
      { scroll: false, shallow: true }
    );
  };

  const openCompanyEditSheet = () => {
    if (!selectedWorkspace) return;
    const draft = workspaceToCompanyEditDraft(selectedWorkspace);
    setEditingCompanyWorkspaceId(selectedWorkspace.companyWorkspaceId);
    setInitialCompanyDraft(draft);
    setCompanyDraft(draft);
  };

  const closeCompanyEditSheet = () => {
    if (updateCompanyWorkspace.isPending) return;
    setEditingCompanyWorkspaceId(null);
    setInitialCompanyDraft(null);
    setCompanyDraft(null);
  };

  const handleCompanySave = async () => {
    if (!editingCompanyWorkspaceId || !companyDraft) return;

    try {
      await updateCompanyWorkspace.mutateAsync({
        ...companyDraft,
        workspaceId: editingCompanyWorkspaceId,
      });
      setEditingCompanyWorkspaceId(null);
      setInitialCompanyDraft(null);
      setCompanyDraft(null);
      showToast({
        message: "회사 정보가 수정되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "회사 정보 수정에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const companyFetchCount = useIsFetching({
    queryKey: queryKeys.opsCompany.all,
  });
  const refreshPending = catalog.isFetching || companyFetchCount > 0;

  return (
    <>
      <Head>
        <title>Company Ops · Harper Ops</title>
        <meta name="description" content="Ops company workspace management" />
      </Head>

      <OpsShell
        compactHeader
        title="Company Ops"
        actions={
          <div className="flex items-center gap-2">
            <MuteButton
              type="button"
              onClick={handleRefresh}
              variant="transparent"
            >
              {refreshPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              새로고침
            </MuteButton>
          </div>
        }
      >
        <div className="space-y-4">
          <TabBoxes
            activeValue={view}
            items={[
              { value: "companies", label: "회사별" },
              { value: "statistics", label: "전체 통계" },
            ]}
            onValueChange={(value) => {
              void router.push(
                value === "statistics"
                  ? "/ops/company?view=statistics"
                  : "/ops/company",
                undefined,
                { shallow: true }
              );
            }}
            size="sm"
          />
          {view === "statistics" && !queryWorkspaceId ? (
            <CompanyAnalytics enabled={canFetchInternal} />
          ) : (
            <section className="space-y-4">
              {catalog.catalogErrorMessage ? (
                <div
                  className={cx(
                    opsTheme.errorNotice,
                    "flex items-start gap-2 xl:col-span-2"
                  )}
                >
                  목록을 불러오지 못했습니다: {catalog.catalogErrorMessage}
                </div>
              ) : null}

              {!queryWorkspaceId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[13px] font-medium text-neutral-muted">
                      회사
                    </div>
                    {!catalog.catalogLoading && !catalog.catalogErrorMessage ? (
                      <div className="text-xs text-neutral-muted">
                        {catalog.workspaces.length} /{" "}
                        {catalog.workspaceTotalCount}개
                      </div>
                    ) : null}
                  </div>

                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      catalog.onWorkspaceSearchSubmit();
                    }}
                  >
                    <UiInput
                      type="search"
                      aria-label="회사명 검색"
                      value={catalog.workspaceSearch}
                      onChange={(event) =>
                        catalog.onWorkspaceSearchChange(event.target.value)
                      }
                      placeholder="회사명 검색"
                      className="min-w-0 flex-1"
                    />
                    <MuteButton aria-label="회사 검색" type="submit">
                      <Search className="h-4 w-4" />
                    </MuteButton>
                  </form>

                  <div className="space-y-2">
                    {catalog.catalogLoading ? (
                      <EmptyState copy="회사 목록을 불러오는 중입니다." />
                    ) : catalog.catalogErrorMessage ? (
                      <EmptyState copy="회사 목록을 새로고침해 주세요." />
                    ) : catalog.workspaces.length === 0 ? (
                      <EmptyState copy="조건에 맞는 회사가 없습니다." />
                    ) : (
                      catalog.workspaces.map((workspace) => (
                        <CompanyDirectoryRow
                          key={workspace.companyWorkspaceId}
                          workspace={workspace}
                          summaryError={Boolean(dashboard.error)}
                          summary={dashboard.data?.companies.find(
                            (c) => c.id === workspace.companyWorkspaceId
                          )}
                          onSelect={() =>
                            handleWorkspaceSelect(workspace.companyWorkspaceId)
                          }
                        />
                      ))
                    )}
                  </div>

                  {catalog.workspaces.length < catalog.workspaceTotalCount &&
                  !catalog.catalogLoading &&
                  !catalog.catalogErrorMessage ? (
                    <MuteButton
                      type="button"
                      onClick={catalog.onLoadMoreWorkspaces}
                      variant="transparent"
                      className="w-full"
                    >
                      <ChevronDown className="h-4 w-4" />
                      더보기
                    </MuteButton>
                  ) : null}
                  {dashboard.error && (
                    <p role="alert" className="text-xs text-critical">
                      역할·활동 요약을 불러오지 못했습니다. 새로고침해 주세요.
                    </p>
                  )}
                </div>
              )}

              {queryWorkspaceId && (
                <div className="min-w-0">
                  <MuteButton
                    variant="transparent"
                    onClick={() =>
                      void router.push("/ops/company", undefined, {
                        shallow: true,
                      })
                    }
                  >
                    ← 회사 목록
                  </MuteButton>
                  {!selectedWorkspace ? (
                    <EmptyState
                      copy={
                        detailQuery.isLoading
                          ? "회사 정보를 불러오는 중입니다."
                          : "회사 정보를 찾을 수 없습니다. 회사 목록에서 다시 선택해 주세요."
                      }
                    />
                  ) : (
                    <div className="space-y-5 rounded-2xl bg-bg-weak p-3 sm:p-5">
                      <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          {selectedWorkspace.logoUrl ? (
                            <span
                              aria-hidden="true"
                              className="h-10 w-10 shrink-0 rounded-md border border-neutral-1000-a05 bg-bg-floating bg-cover bg-center"
                              style={{
                                backgroundImage: `url(${selectedWorkspace.logoUrl})`,
                              }}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-weak text-sm font-medium text-neutral-muted"
                            >
                              {selectedWorkspace.companyName
                                .trim()
                                .slice(0, 1)
                                .toUpperCase() || "?"}
                            </span>
                          )}
                          <div className="min-w-0">
                            <h1 className="break-words text-xl font-medium tracking-tight sm:text-2xl">
                              {selectedWorkspace.companyName}
                            </h1>
                            <p className="text-xs text-neutral-muted">
                              최근 수정{" "}
                              {formatOpsCompanyDate(
                                selectedWorkspace.updatedAt
                              )}
                            </p>
                          </div>
                        </div>
                        <MuteButton
                          id="company-edit-trigger"
                          onClick={openCompanyEditSheet}
                        >
                          <Pencil className="h-4 w-4" />
                          회사 정보 수정
                        </MuteButton>
                      </div>
                      <CompanyAnalytics
                        enabled={canFetchInternal}
                        workspaceId={selectedWorkspace.companyWorkspaceId}
                      />
                      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                        <CompanyActivityPanel
                          key={`activity-${selectedWorkspaceId}`}
                          enabled={canFetchInternal}
                          workspaceId={selectedWorkspace.companyWorkspaceId}
                        />
                        <CompanyConversationsTab
                          key={`conversations-${selectedWorkspaceId}`}
                          enabled={canFetchInternal}
                          workspaceId={selectedWorkspace.companyWorkspaceId}
                        />
                      </div>
                      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                        <div className="min-w-0 space-y-3 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-4">
                          <h2 className="text-sm font-medium">팀원</h2>
                          <form
                            className="flex items-center gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              setAppliedMemberSearch(memberSearch.trim());
                            }}
                          >
                            <div className="relative min-w-0 flex-1">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-muted" />
                              <UiInput
                                value={memberSearch}
                                onChange={(event) =>
                                  setMemberSearch(event.target.value)
                                }
                                aria-label="팀원 이름 또는 이메일 검색"
                                placeholder="이름, 이메일 검색"
                                className="pl-9"
                              />
                            </div>
                            <MuteButton type="submit" variant="neutral">
                              <Search className="h-4 w-4" />
                              검색
                            </MuteButton>
                          </form>
                          {membersQuery.isLoading ? (
                            <EmptyState copy="팀원을 불러오는 중입니다." />
                          ) : membersQuery.error ? (
                            <EmptyState copy="팀원 목록을 새로고침해 주세요." />
                          ) : (membersQuery.data?.items.length ?? 0) === 0 ? (
                            <EmptyState copy="표시할 팀원이 없습니다." />
                          ) : (
                            <div className="border-y border-neutral-1000-a05">
                              {membersQuery.data?.items.map((member) => (
                                <MemberRow
                                  key={member.membershipId}
                                  member={member}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        <section className="min-w-0 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-4">
                          <h2 className="mb-3 text-sm font-medium">역할</h2>
                          <CompanyRolesOverview
                            enabled={canFetchInternal}
                            workspaceId={selectedWorkspace.companyWorkspaceId}
                          />
                        </section>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </OpsShell>
      {companyDraft && initialCompanyDraft ? (
        <CompanyEditSheet
          open={Boolean(editingCompanyWorkspaceId)}
          draft={companyDraft}
          initialDraft={initialCompanyDraft}
          onChange={setCompanyDraft}
          onClose={closeCompanyEditSheet}
          onSubmit={() => void handleCompanySave()}
          pending={updateCompanyWorkspace.isPending}
        />
      ) : null}
    </>
  );
}
