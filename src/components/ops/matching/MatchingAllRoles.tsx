import { RoleCreateModal } from "@/components/ops/opportunities/modals";
import {
  EMPTY_ROLE_DRAFT,
  roleToDraft,
  STATUS_LABEL,
  type RoleDraft,
} from "@/components/ops/opportunities/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input as UiInput } from "@/components/ui/input";
import { Tooltips } from "@/components/ui/tooltip";
import {
  useOpsMatchingAllRoles,
  useUpdateOpsMatchingAllRole,
} from "@/hooks/ops/useOpsMatching";
import { useSaveOpsOpportunityRole } from "@/hooks/ops/useOpsOpportunities";
import {
  OPS_MATCHING_ALL_ROLES_PAGE_SIZE,
  type OpsMatchingAllRoleCandidateCounts,
  type OpsMatchingAllRoleItem,
} from "@/lib/ops/matching";
import type { OpportunityStatus } from "@/lib/ops/opportunity";
import {
  LoaderCircle,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  Search,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

type RoleGroup = {
  companyName: string;
  companyWorkspaceId: string;
  logoUrl: string | null;
  roles: OpsMatchingAllRoleItem[];
};

const CANDIDATE_METRICS: Array<{
  description: string;
  key: keyof OpsMatchingAllRoleCandidateCounts;
  label: string;
}> = [
  {
    description: "이 role을 제안받은 고유 후보자 수입니다.",
    key: "suggested",
    label: "제안",
  },
  {
    description: "연결 제안을 수락했고 현재 아카이브가 아닌 후보자 수입니다.",
    key: "accepted",
    label: "수락",
  },
  {
    description: "회사 연결을 기다리고 있는 후보자 수입니다.",
    key: "pendingConnection",
    label: "연결 대기",
  },
  {
    description: "거절, 아카이브 또는 프로세스 중단 상태인 후보자 수입니다.",
    key: "processEnded",
    label: "종료",
  },
  {
    description:
      "수락, 연결 대기, 최종 오퍼 또는 커스텀 채용 단계에 있는 후보자 수입니다.",
    key: "processInProgress",
    label: "진행중",
  },
];

function CompanyLogo({
  companyName,
  logoUrl,
  size = "md",
}: {
  companyName: string;
  logoUrl: string | null;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  if (logoUrl) {
    return (
      <span
        aria-hidden
        className={cx(
          "shrink-0 rounded-md bg-bg-floating bg-cover bg-center",
          sizeClass
        )}
        style={{ backgroundImage: `url(${logoUrl})` }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-md bg-bg-weak font-medium text-neutral-muted",
        sizeClass
      )}
    >
      {companyName.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function CandidateCounts({
  counts,
}: {
  counts: OpsMatchingAllRoleCandidateCounts;
}) {
  return (
    <div className="grid min-w-[350px] grid-cols-5 gap-1">
      {CANDIDATE_METRICS.map((metric) => {
        const count = counts[metric.key];
        const isUrgent = metric.key === "pendingConnection" && count >= 3;
        return (
          <Tooltips key={metric.key} text={metric.description} side="top">
            <div
              className={cx(
                "rounded-md bg-bg-weak px-1.5 py-1 text-center",
                isUrgent && "bg-critical-faded"
              )}
            >
              <div
                className={cx(
                  "text-[9px] leading-3 text-neutral-soft",
                  isUrgent && "font-medium text-critical"
                )}
              >
                {metric.label}
              </div>
              <div
                className={cx(
                  "mt-0.5 text-xs font-medium text-neutral-primary",
                  isUrgent && "text-critical"
                )}
              >
                {count}
              </div>
            </div>
          </Tooltips>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: OpportunityStatus }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2 py-1 text-[10px] font-medium",
        (status === "active" || status === "top_priority") &&
          "bg-positive-faded text-positive",
        status === "paused" && "bg-bg-weak text-neutral-muted",
        status === "ended" && "bg-critical-faded text-critical"
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function MatchingAllRoles({
  canFetchInternal,
}: {
  canFetchInternal: boolean;
}) {
  const router = useRouter();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [editingRole, setEditingRole] = useState<OpsMatchingAllRoleItem | null>(
    null
  );
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(EMPTY_ROLE_DRAFT);
  const allRolesQuery = useOpsMatchingAllRoles({
    enabled: canFetchInternal,
    limit: OPS_MATCHING_ALL_ROLES_PAGE_SIZE,
    query,
  });
  const updateRole = useUpdateOpsMatchingAllRole();
  const saveRole = useSaveOpsOpportunityRole();
  const roles = useMemo(
    () => allRolesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [allRolesQuery.data?.pages]
  );
  const fetchNextPage = allRolesQuery.fetchNextPage;
  const hasNextPage = allRolesQuery.hasNextPage;
  const isFetchingNextPage = allRolesQuery.isFetchingNextPage;
  const totalCount = allRolesQuery.data?.pages[0]?.totalCount ?? 0;
  const groups = useMemo(() => {
    const groupMap = new Map<string, RoleGroup>();
    for (const role of roles) {
      const current = groupMap.get(role.companyWorkspaceId) ?? {
        companyName: role.companyName,
        companyWorkspaceId: role.companyWorkspaceId,
        logoUrl: role.logoUrl,
        roles: [],
      };
      current.roles.push(role);
      groupMap.set(role.companyWorkspaceId, current);
    }
    return Array.from(groupMap.values());
  }, [roles]);
  const pendingRoleId = updateRole.isPending
    ? (updateRole.variables?.roleId ?? null)
    : saveRole.isPending
      ? (editingRole?.roleId ?? null)
      : null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "240px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const openRoleEditModal = (role: OpsMatchingAllRoleItem) => {
    setEditingRole(role);
    setRoleDraft(roleToDraft(role));
  };

  const closeRoleEditModal = () => {
    if (saveRole.isPending) return;
    setEditingRole(null);
    setRoleDraft(EMPTY_ROLE_DRAFT);
  };

  const handleRoleSave = async () => {
    if (!editingRole) return;
    try {
      await saveRole.mutateAsync({
        ...roleDraft,
        companyWorkspaceId: editingRole.companyWorkspaceId,
        roleId: editingRole.roleId,
      });
      await allRolesQuery.refetch();
      setEditingRole(null);
      setRoleDraft(EMPTY_ROLE_DRAFT);
      showToast({ message: "role이 수정되었습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "role 수정에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const handleRoleSettingChange = async (
    role: OpsMatchingAllRoleItem,
    patch: { status: OpportunityStatus }
  ) => {
    try {
      await updateRole.mutateAsync({ roleId: role.roleId, ...patch });
      showToast({ message: "role 설정이 변경되었습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "role 설정 변경에 실패했습니다.",
        variant: "white",
      });
    }
  };

  const goToRolePipeline = (role: OpsMatchingAllRoleItem) => {
    void router.push({
      pathname: "/ops/matching",
      query: {
        company: role.companyWorkspaceId,
        role: role.roleId,
        tab: "harper_review",
      },
    });
  };

  return (
    <div className="space-y-3">
      <div
        className={cx(
          opsTheme.panel,
          "flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
        )}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiInput
            unstyled
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="회사명 또는 Role title 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="shrink-0 text-xs text-neutral-muted">
          {roles.length} / {totalCount} roles
        </div>
      </div>

      {allRolesQuery.error ? (
        <div className={opsTheme.errorNotice}>
          {allRolesQuery.error instanceof Error
            ? allRolesQuery.error.message
            : "All Roles를 불러오지 못했습니다."}
        </div>
      ) : null}

      <div className={cx(opsTheme.panel, "overflow-hidden")}>
        {allRolesQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-neutral-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Role을 불러오는 중입니다.
          </div>
        ) : roles.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-neutral-muted">
            조건에 맞는 internal role이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1070px] border-collapse text-left">
              <thead className="bg-bg-weak text-[10px] font-medium uppercase tracking-[0.04em] text-neutral-soft">
                <tr>
                  <th className="w-[190px] px-3 py-2">회사</th>
                  <th className="min-w-[220px] px-3 py-2">Role title</th>
                  <th className="w-[390px] px-3 py-2">후보자</th>
                  <th className="w-[90px] px-3 py-2">Status</th>
                  <th className="w-[58px] px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.companyWorkspaceId}>
                  <tr className="border-t border-neutral-1000-a05 bg-bg-default/80">
                    <td colSpan={5} className="px-3 py-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-neutral-primary">
                        <CompanyLogo
                          companyName={group.companyName}
                          logoUrl={group.logoUrl}
                          size="sm"
                        />
                        {group.companyName}
                        <span className="font-normal text-neutral-soft">
                          {group.roles.length} roles
                        </span>
                      </div>
                    </td>
                  </tr>
                  {group.roles.map((role) => {
                    const isRunning =
                      role.status === "active" ||
                      role.status === "top_priority";
                    const rowPending = pendingRoleId === role.roleId;
                    return (
                      <tr
                        key={role.roleId}
                        tabIndex={0}
                        onClick={() => goToRolePipeline(role)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            goToRolePipeline(role);
                          }
                        }}
                        className="cursor-pointer border-t border-neutral-1000-a05 text-xs text-neutral-primary outline-none transition hover:bg-bg-weak/70 focus-visible:bg-bg-weak"
                      >
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <CompanyLogo
                              companyName={role.companyName}
                              logoUrl={role.logoUrl}
                              size="sm"
                            />
                            <span className="truncate text-[11px] text-neutral-muted">
                              {role.companyName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="max-w-[300px] truncate font-medium">
                            {role.name}
                          </div>
                          {role.locationText ? (
                            <div className="mt-0.5 truncate text-[10px] text-neutral-soft">
                              {role.locationText}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          <CandidateCounts counts={role.candidateCounts} />
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={role.status} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`${role.name} 작업`}
                                disabled={rowPending}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-soft outline-none transition hover:bg-black/5 hover:text-neutral-primary disabled:opacity-50"
                              >
                                {rowPending ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DropdownMenuItem
                                variant="sm"
                                disabled={rowPending}
                                onSelect={(event) => {
                                  event.stopPropagation();
                                  void handleRoleSettingChange(role, {
                                    status: isRunning ? "paused" : "active",
                                  });
                                }}
                              >
                                {isRunning ? (
                                  <PauseCircle className="h-3.5 w-3.5" />
                                ) : (
                                  <PlayCircle className="h-3.5 w-3.5" />
                                )}
                                {isRunning ? "중단" : "진행"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="sm"
                                disabled={rowPending}
                                onSelect={(event) => {
                                  event.stopPropagation();
                                  openRoleEditModal(role);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                수정하기
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>

      <div
        ref={loadMoreRef}
        className="flex min-h-10 items-center justify-center"
      >
        {allRolesQuery.isFetchingNextPage ? (
          <div className="inline-flex items-center gap-2 text-xs text-neutral-muted">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            다음 20개를 불러오는 중...
          </div>
        ) : allRolesQuery.hasNextPage ? (
          <BareButton
            type="button"
            onClick={() => void allRolesQuery.fetchNextPage()}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
          >
            20개 더 보기
          </BareButton>
        ) : roles.length > 0 ? (
          <div className="text-xs text-neutral-soft">
            모든 role을 불러왔습니다.
          </div>
        ) : null}
      </div>

      <RoleCreateModal
        open={editingRole !== null}
        draft={roleDraft}
        mode="edit"
        onChange={setRoleDraft}
        onClose={closeRoleEditModal}
        onSubmit={() => void handleRoleSave()}
        pending={saveRole.isPending}
        workspaceName={editingRole?.companyName ?? null}
      />
    </div>
  );
}
