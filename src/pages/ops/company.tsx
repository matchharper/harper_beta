import {
  EmptyState,
  EMPTY_ROLE_DRAFT,
  roleToDraft,
  type RoleDraft,
  RoleOptionCard,
  Token,
  formatUpdatedAt,
} from "@/components/ops/opportunities/shared";
import { RoleCreateModal } from "@/components/ops/opportunities/modals";
import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { TabBoxes } from "@/components/ui/tab-boxes";
import {
  OPS_COMPANY_ACTIVITY_PAGE_SIZE,
  useOpsCompanyActivity,
  useOpsCompanyMembers,
} from "@/hooks/ops/useOpsCompany";
import { useSaveOpsOpportunityRole } from "@/hooks/ops/useOpsOpportunities";
import { useOpsOpportunityCatalogController } from "@/hooks/ops/useOpsOpportunityCatalogController";
import { isInternalEmail } from "@/lib/internalAccess";
import type {
  OpsCompanyActivityItem,
  OpsCompanyMemberRecord,
} from "@/lib/ops/company";
import type {
  OpsOpportunityRoleRecord,
  OpsOpportunityWorkspaceRecord,
} from "@/lib/ops/opportunity";
import { useAuthStore } from "@/store/useAuthStore";
import {
  ChevronDown,
  Copy,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

type CompanyDetailTab = "roles" | "members" | "activity";

const DETAIL_TABS: Array<{ id: CompanyDetailTab; label: string }> = [
  { id: "roles", label: "Roles" },
  { id: "members", label: "Members" },
  { id: "activity", label: "최근 활동" },
];
const DETAIL_TAB_IDS = new Set<CompanyDetailTab>(
  DETAIL_TABS.map((tab) => tab.id)
);

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDetailTab(value: string | string[] | undefined) {
  const tab = getQueryText(value);
  return DETAIL_TAB_IDS.has(tab as CompanyDetailTab)
    ? (tab as CompanyDetailTab)
    : "roles";
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

function CompanyCard({
  active,
  onSelect,
  workspace,
}: {
  active: boolean;
  onSelect: () => void;
  workspace: OpsOpportunityWorkspaceRecord;
}) {
  const logoInitial = workspace.companyName.trim().slice(0, 1).toUpperCase();

  return (
    <article
      className={cx(
        "relative overflow-hidden rounded-md border-2 transition",
        active
          ? "border-primary bg-bg-floating shadow-sm"
          : "border-neutral-1000-a05 bg-bg-default/65 hover:border-primary/45 hover:bg-bg-default"
      )}
    >
      <div className="px-3 pt-3">
        <BareButton
          type="button"
          onClick={onSelect}
          className="flex w-full min-w-0 items-center gap-2.5 text-left text-neutral-primary"
        >
          {workspace.logoUrl ? (
            <span
              aria-hidden="true"
              className={cx(
                "h-8 w-8 shrink-0 rounded-md bg-bg-floating bg-cover bg-center"
              )}
              style={{ backgroundImage: `url(${workspace.logoUrl})` }}
            />
          ) : (
            <span
              aria-hidden="true"
              className={cx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-medium",
                active
                  ? "border-primary/20 bg-primary-faded text-primary"
                  : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted"
              )}
            >
              {logoInitial || "?"}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {workspace.companyName}
            </div>
          </div>
        </BareButton>
      </div>

      <BareButton
        type="button"
        onClick={onSelect}
        className="w-full px-3 pb-3 pt-3 text-left text-neutral-primary"
      >
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ["Roles", workspace.totalRoleCount],
            ["Active", workspace.activeRoleCount],
            ["Members", workspace.memberCount],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className={cx(
                "rounded-md px-2 py-2",
                active ? "bg-primary-faded" : "bg-bg-floating"
              )}
            >
              <div
                className={cx(
                  "text-[10px] uppercase",
                  active ? "text-primary/70" : "text-neutral-soft"
                )}
              >
                {label}
              </div>
              <div className="mt-1 text-sm font-medium">{value}</div>
            </div>
          ))}
        </div>
      </BareButton>
    </article>
  );
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
    <div className="grid grid-cols-[auto_minmax(0,1fr)_120px_110px] items-center gap-3 border-b border-neutral-1000-a05 px-3 py-3 last:border-b-0 max-lg:grid-cols-[auto_minmax(0,1fr)]">
      <Avatar member={member} />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-neutral-primary">
          {member.name || "이름 없음"}
        </div>
        <div className="truncate text-xs text-neutral-muted">
          {member.email || member.userId}
        </div>
      </div>
      <div className="truncate text-xs text-neutral-muted max-lg:hidden">
        {member.role || "-"}
      </div>
      <div className="text-xs text-neutral-muted max-lg:hidden">
        {formatUpdatedAt(member.joinedAt)}
      </div>
    </div>
  );
}

function activityAccentClassName(kind: OpsCompanyActivityItem["kind"]) {
  switch (kind) {
    case "candidate_accepted":
      return "bg-positive";
    case "candidate_recommended":
      return "bg-positive";
    case "candidate_status_changed":
      return "bg-info";
    case "member_joined":
      return "bg-primary";
    case "memo_left":
      return "bg-amber-500";
    case "role_created":
      return "bg-neutral-1000";
    case "role_deleted":
      return "bg-critical";
    case "role_updated":
      return "bg-neutral-500";
    default:
      return "bg-neutral-400";
  }
}

function ActivityRow({ item }: { item: OpsCompanyActivityItem }) {
  return (
    <div className="grid grid-cols-[12px_minmax(0,1fr)_120px] items-start gap-3 border-b border-neutral-1000-a05 px-3 py-3 last:border-b-0 max-md:grid-cols-[12px_minmax(0,1fr)]">
      <span
        className={cx(
          "mt-1 h-2.5 w-2.5 rounded-full",
          activityAccentClassName(item.kind)
        )}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium text-neutral-primary">
            {item.title}
          </div>
          {item.meta ? (
            <span className="shrink-0 rounded-md bg-bg-weak px-2 py-0.5 text-[11px] text-neutral-muted">
              {item.meta}
            </span>
          ) : null}
        </div>
        {item.subtitle ? (
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-muted">
            {item.subtitle}
          </div>
        ) : null}
      </div>
      <div className="text-right text-xs text-neutral-muted max-md:hidden">
        {formatUpdatedAt(item.occurredAt)}
      </div>
    </div>
  );
}

function buildWorkspaceInviteUrl(workspaceId: string) {
  const path = `/org?orgId=${encodeURIComponent(workspaceId)}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export default function OpsCompanyPage() {
  const router = useRouter();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editingRole, setEditingRole] =
    useState<OpsOpportunityRoleRecord | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(EMPTY_ROLE_DRAFT);
  const [isRoleEditModalOpen, setIsRoleEditModalOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [appliedMemberSearch, setAppliedMemberSearch] = useState("");

  const catalog = useOpsOpportunityCatalogController({
    canFetchInternal,
    view: "catalog",
  });
  const saveRole = useSaveOpsOpportunityRole();
  const setCatalogSelectedWorkspaceId = catalog.setSelectedWorkspaceId;
  const queryWorkspaceId = router.isReady
    ? getQueryText(router.query.workspaceId)
    : "";
  const queryTab = router.isReady
    ? normalizeDetailTab(router.query.tab)
    : "roles";
  const activeTab = queryTab;

  const selectedWorkspace = catalog.selectedWorkspace;
  const selectedWorkspaceId = catalog.selectedWorkspaceId;

  useEffect(() => {
    if (!router.isReady) return;
    const timeout = window.setTimeout(() => {
      setCatalogSelectedWorkspaceId(queryWorkspaceId || null);
      setSelectedRoleId(null);
      setAppliedMemberSearch("");
      setMemberSearch("");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [queryWorkspaceId, router.isReady, setCatalogSelectedWorkspaceId]);

  const membersQuery = useOpsCompanyMembers({
    enabled: canFetchInternal && activeTab === "members",
    query: appliedMemberSearch,
    workspaceId: selectedWorkspaceId,
  });
  const activityQuery = useOpsCompanyActivity({
    enabled: canFetchInternal && activeTab === "activity",
    workspaceId: selectedWorkspaceId,
  });

  const activityItems = useMemo(
    () => activityQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [activityQuery.data?.pages]
  );

  const handleRefresh = () => {
    void catalog.refetchCatalog();
    void catalog.refetchRoles();
    if (selectedWorkspaceId && activeTab === "members") {
      void membersQuery.refetch();
    }
    if (selectedWorkspaceId && activeTab === "activity") {
      void activityQuery.refetch();
    }
  };

  const handleWorkspaceSelect = (workspaceId: string) => {
    setSelectedRoleId(null);
    setAppliedMemberSearch("");
    setMemberSearch("");
    catalog.onWorkspaceSelect(workspaceId);
    void router.push(
      buildCompanyPagePath({ tab: activeTab, workspaceId }),
      undefined,
      { scroll: false, shallow: true }
    );
  };

  const handleTabChange = (tab: CompanyDetailTab) => {
    void router.push(
      buildCompanyPagePath({ tab, workspaceId: selectedWorkspaceId }),
      undefined,
      { scroll: false, shallow: true }
    );
  };

  const handleCopyInviteLink = async () => {
    if (!selectedWorkspaceId) return;
    try {
      await navigator.clipboard.writeText(
        buildWorkspaceInviteUrl(selectedWorkspaceId)
      );
      showToast({ message: "초대 링크가 복사되었습니다.", variant: "white" });
    } catch {
      showToast({
        message: "초대 링크 복사에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const openRoleEditModal = (role: OpsOpportunityRoleRecord) => {
    setSelectedRoleId(role.roleId);
    setEditingRole(role);
    setRoleDraft(roleToDraft(role));
    setIsRoleEditModalOpen(true);
  };

  const closeRoleEditModal = () => {
    if (saveRole.isPending) return;
    setIsRoleEditModalOpen(false);
    setEditingRole(null);
    setRoleDraft(EMPTY_ROLE_DRAFT);
  };

  const handleRoleSave = async () => {
    if (!editingRole) {
      showToast({
        message: "수정할 role을 먼저 선택해 주세요.",
        variant: "white",
      });
      return;
    }

    try {
      const response = await saveRole.mutateAsync({
        ...roleDraft,
        companyWorkspaceId: editingRole.companyWorkspaceId,
        roleId: editingRole.roleId,
      });
      setSelectedRoleId(response.role.roleId);
      setIsRoleEditModalOpen(false);
      setEditingRole(null);
      setRoleDraft(EMPTY_ROLE_DRAFT);
      showToast({
        message: "role이 수정되었습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "role 수정에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const refreshPending =
    catalog.isFetching || membersQuery.isFetching || activityQuery.isFetching;

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
          <BareButton
            type="button"
            onClick={handleRefresh}
            className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
          >
            {refreshPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            새로고침
          </BareButton>
        }
      >
        <div className="space-y-4">
          <div className={cx(opsTheme.panel, "p-4")}>
            <form
              className="flex flex-col gap-2 lg:flex-row lg:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                catalog.onWorkspaceSearchSubmit();
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                <UiInput
                  unstyled
                  value={catalog.workspaceSearch}
                  onChange={(event) =>
                    catalog.onWorkspaceSearchChange(event.target.value)
                  }
                  placeholder="회사명 검색"
                  className={cx(opsTheme.input, "pl-9")}
                />
              </div>
              <BareButton
                type="submit"
                className={cx(opsTheme.buttonPrimary, "h-11 px-3")}
              >
                <Search className="h-4 w-4" />
                검색
              </BareButton>
            </form>
          </div>

          <section className="grid gap-4 xl:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
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

            <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] font-medium text-neutral-muted">
                  회사
                </div>
                {!catalog.catalogLoading && !catalog.catalogErrorMessage ? (
                  <div className="text-xs text-neutral-muted">
                    {catalog.workspaces.length} / {catalog.workspaceTotalCount}
                    개
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                {catalog.catalogLoading ? (
                  <EmptyState copy="회사 목록을 불러오는 중입니다." />
                ) : catalog.catalogErrorMessage ? (
                  <EmptyState copy="회사 목록을 새로고침해 주세요." />
                ) : catalog.workspaces.length === 0 ? (
                  <EmptyState copy="조건에 맞는 회사가 없습니다." />
                ) : (
                  catalog.workspaces.map((workspace) => (
                    <CompanyCard
                      key={workspace.companyWorkspaceId}
                      active={
                        workspace.companyWorkspaceId === selectedWorkspaceId
                      }
                      onSelect={() =>
                        handleWorkspaceSelect(workspace.companyWorkspaceId)
                      }
                      workspace={workspace}
                    />
                  ))
                )}
              </div>

              {catalog.workspaces.length < catalog.workspaceTotalCount &&
              !catalog.catalogLoading &&
              !catalog.catalogErrorMessage ? (
                <BareButton
                  type="button"
                  onClick={catalog.onLoadMoreWorkspaces}
                  className={cx(opsTheme.buttonSecondary, "h-10 w-full")}
                >
                  <ChevronDown className="h-4 w-4" />
                  더보기
                </BareButton>
              ) : null}
            </div>

            <div className={cx(opsTheme.panel, "min-w-0 p-4")}>
              {!selectedWorkspace ? (
                <EmptyState copy="회사를 선택해 주세요." />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 lg:w-[620px]">
                      <TabBoxes
                        activeValue={activeTab}
                        items={DETAIL_TABS.map((tab) => ({
                          label: tab.label,
                          value: tab.id,
                        }))}
                        listClassName="min-w-full"
                        onValueChange={handleTabChange}
                        size="md"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Token>{selectedWorkspace.totalRoleCount} roles</Token>
                        <Token>
                          {selectedWorkspace.activeRoleCount} active
                        </Token>
                        <Token>{selectedWorkspace.memberCount} members</Token>
                      </div>
                    </div>
                  </div>

                  {activeTab === "roles" ? (
                    <div className="space-y-3">
                      <form
                        className="grid gap-2 lg:grid-cols-[1fr_auto]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          catalog.onRoleSearchSubmit();
                        }}
                      >
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                          <UiInput
                            unstyled
                            value={catalog.roleSearch}
                            onChange={(event) =>
                              catalog.onRoleSearchChange(event.target.value)
                            }
                            placeholder="role, location 검색"
                            className={cx(opsTheme.input, "pl-9")}
                          />
                        </div>
                        <BareButton
                          type="submit"
                          className={cx(opsTheme.buttonPrimary, "h-11 px-3")}
                        >
                          <Search className="h-4 w-4" />
                          검색
                        </BareButton>
                      </form>
                      {!catalog.roleLoading ? (
                        <div className="text-xs text-neutral-muted">
                          {catalog.catalogRoles.length} /{" "}
                          {catalog.roleTotalCount}개 roles
                        </div>
                      ) : null}
                      {catalog.roleLoading ? (
                        <EmptyState copy="Roles를 불러오는 중입니다." />
                      ) : catalog.catalogRoles.length === 0 ? (
                        <EmptyState copy="표시할 role이 없습니다." />
                      ) : (
                        <div className="space-y-2">
                          {catalog.catalogRoles.map((role) => (
                            <RoleOptionCard
                              key={role.roleId}
                              role={role}
                              active={role.roleId === selectedRoleId}
                              onSelect={() => setSelectedRoleId(role.roleId)}
                              onEdit={() => openRoleEditModal(role)}
                            />
                          ))}
                        </div>
                      )}
                      {catalog.catalogRoles.length < catalog.roleTotalCount &&
                      !catalog.roleLoading ? (
                        <BareButton
                          type="button"
                          onClick={catalog.onLoadMoreRoles}
                          className={cx(
                            opsTheme.buttonSecondary,
                            "h-10 w-full"
                          )}
                        >
                          <ChevronDown className="h-4 w-4" />
                          더보기
                        </BareButton>
                      ) : null}
                    </div>
                  ) : null}

                  {activeTab === "members" ? (
                    <div className="space-y-3">
                      <form
                        className="grid gap-2 lg:grid-cols-[1fr_auto_auto]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          setAppliedMemberSearch(memberSearch.trim());
                        }}
                      >
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                          <UiInput
                            unstyled
                            value={memberSearch}
                            onChange={(event) =>
                              setMemberSearch(event.target.value)
                            }
                            placeholder="이름, 이메일 검색"
                            className={cx(opsTheme.input, "pl-9")}
                          />
                        </div>
                        <BareButton
                          type="submit"
                          className={cx(opsTheme.buttonPrimary, "h-11 px-3")}
                        >
                          <Search className="h-4 w-4" />
                          검색
                        </BareButton>
                        <BareButton
                          type="button"
                          onClick={handleCopyInviteLink}
                          className={cx(opsTheme.buttonSecondary, "h-11 px-3")}
                        >
                          <Copy className="h-4 w-4" />
                          초대 링크 복사
                        </BareButton>
                      </form>
                      {membersQuery.isLoading ? (
                        <EmptyState copy="멤버를 불러오는 중입니다." />
                      ) : membersQuery.error ? (
                        <EmptyState copy="멤버 목록을 새로고침해 주세요." />
                      ) : (membersQuery.data?.items.length ?? 0) === 0 ? (
                        <EmptyState copy="표시할 멤버가 없습니다." />
                      ) : (
                        <div className="overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-default/60">
                          {membersQuery.data?.items.map((member) => (
                            <MemberRow
                              key={member.membershipId}
                              member={member}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "activity" ? (
                    <div className="space-y-3">
                      {activityQuery.isLoading ? (
                        <EmptyState copy="최근 활동을 불러오는 중입니다." />
                      ) : activityQuery.error ? (
                        <EmptyState copy="최근 활동을 새로고침해 주세요." />
                      ) : activityItems.length === 0 ? (
                        <EmptyState copy="표시할 활동이 없습니다." />
                      ) : (
                        <div className="overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-default/60">
                          {activityItems.map((item) => (
                            <ActivityRow key={item.id} item={item} />
                          ))}
                        </div>
                      )}
                      {activityQuery.hasNextPage ? (
                        <BareButton
                          type="button"
                          onClick={() => void activityQuery.fetchNextPage()}
                          disabled={activityQuery.isFetchingNextPage}
                          className={cx(
                            opsTheme.buttonSecondary,
                            "h-10 w-full"
                          )}
                        >
                          {activityQuery.isFetchingNextPage ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                          {OPS_COMPANY_ACTIVITY_PAGE_SIZE}개 더보기
                        </BareButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      </OpsShell>
      <RoleCreateModal
        open={isRoleEditModalOpen}
        draft={roleDraft}
        mode="edit"
        onChange={setRoleDraft}
        onClose={closeRoleEditModal}
        onSubmit={() => void handleRoleSave()}
        pending={saveRole.isPending}
        workspaceName={
          editingRole?.companyName ?? selectedWorkspace?.companyName ?? null
        }
      />
    </>
  );
}
