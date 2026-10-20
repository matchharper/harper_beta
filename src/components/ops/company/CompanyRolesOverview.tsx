import { formatOpsCompanyDate } from "@/components/ops/dateUtils";
import { EmptyState } from "@/components/ops/opportunities/shared";
import { showToast } from "@/components/toast/toast";
import {
  buildCounts,
  buildRoleStages,
  getRoleStageLabel,
} from "@/lib/org/roleBoardSummary";
import {
  getOrgRoleStatusPresentation,
  getOrgRoleStatusFilterValue,
} from "@/lib/org/roleStatus";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useOpsCompanyBoard,
  useUpdateOpsCompanyRoleCompanyFirstSearch,
} from "@/hooks/ops/useOpsCompany";
import { AppleSwitch } from "@/components/ui/switch";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { useRouter } from "next/router";

export function CompanyRolesOverview({
  enabled,
  workspaceId,
}: {
  enabled: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const boardQuery = useOpsCompanyBoard({ enabled, workspaceId });
  const updateCompanyFirstSearch = useUpdateOpsCompanyRoleCompanyFirstSearch();
  const counts = useMemo(
    () => buildCounts(boardQuery.data?.board.items ?? []),
    [boardQuery.data?.board.items]
  );
  const totals = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of boardQuery.data?.board.items ?? [])
      result.set(item.roleId, (result.get(item.roleId) ?? 0) + 1);
    return result;
  }, [boardQuery.data?.board.items]);
  const roles = boardQuery.data?.roles ?? [];
  const filtered = roles.filter(
    (role) =>
      role.name
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (status === "all" || getOrgRoleStatusFilterValue(role.status) === status)
  );

  const openRole = (role: OrgRole, view: "pipeline" | "role" = "role") => {
    void router.push(
      buildOrgHref({
        orgId: workspaceId,
        page: role.status === "draft" ? "new-role" : "role",
        roleId: role.roleId,
        tab:
          role.status === "draft" || view !== "pipeline"
            ? undefined
            : "pipeline",
        view:
          role.status === "draft" || view !== "pipeline" ? null : "pipeline",
      })
    );
  };

  const updateRoleCompanyFirstSearch = async (args: {
    isCompanyFirstSearch: boolean;
    roleId: string;
    roleName: string;
  }) => {
    try {
      await updateCompanyFirstSearch.mutateAsync({
        isCompanyFirstSearch: args.isCompanyFirstSearch,
        roleId: args.roleId,
        workspaceId,
      });
      showToast({
        message: `${args.roleName}의 먼저 제안 후보 탐색을 ${
          args.isCompanyFirstSearch ? "켰습니다." : "껐습니다."
        }`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "먼저 제안 후보 탐색 설정을 변경하지 못했습니다.",
        variant: "white",
      });
    }
  };

  if (boardQuery.isLoading) {
    return <EmptyState copy="역할을 불러오는 중입니다." />;
  }
  if (boardQuery.error) {
    return <EmptyState copy="역할을 새로고침해 주세요." />;
  }

  return (
    <div className="min-w-0">
      {roles.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1" aria-label="역할 상태 필터">
            {[
              ["all", "전체"],
              ["active", "채용 중"],
              ["draft", "작성 중"],
              ["paused", "중단"],
              ["ended", "종료"],
            ].map(([value, label]) => (
              <MuteButton
                key={value}
                size="sm"
                variant={status === value ? "neutral" : "transparent"}
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
              >
                {label}
              </MuteButton>
            ))}
          </div>
          <Input
            className="w-full sm:w-64"
            aria-label="역할 검색"
            placeholder="역할 이름 검색"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      )}
      {!filtered.length && (
        <p className="py-6 text-sm text-neutral-muted">
          {roles.length
            ? "조건에 맞는 역할이 없습니다."
            : "등록된 역할이 없습니다."}
        </p>
      )}
      {filtered.map((role) => {
        const labelId = `role-company-first-search-${role.roleId}`;
        const pending =
          updateCompanyFirstSearch.isPending &&
          updateCompanyFirstSearch.variables?.roleId === role.roleId;
        const stages = buildRoleStages(boardQuery.data?.board, role);
        const total = totals.get(role.roleId) ?? 0;
        return (
          <article
            key={role.roleId}
            className="min-w-0 border-b border-neutral-1000-a10 py-4 first:pt-0 last:border-0 last:pb-0"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="min-w-0">
                <MuteButton
                  variant="transparent"
                  className="h-auto max-w-full whitespace-normal rounded-none px-0 text-left text-sm font-medium text-neutral-primary hover:bg-transparent hover:underline"
                  onClick={() => openRole(role)}
                >
                  {role.name}
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </MuteButton>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-muted">
                  <span className="font-medium text-neutral-primary">
                    {getOrgRoleStatusPresentation(role.status).label}
                  </span>
                  {role.locationText && <span>{role.locationText}</span>}
                  {role.workMode && <span>{role.workMode}</span>}
                  <span>수정 {formatOpsCompanyDate(role.updatedAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 py-1">
                <span id={labelId} className="text-xs text-neutral-muted">
                  먼저 제안 후보 탐색
                </span>
                <AppleSwitch
                  aria-labelledby={labelId}
                  checked={role.isCompanyFirstSearch === true}
                  disabled={updateCompanyFirstSearch.isPending}
                  onCheckedChange={(isCompanyFirstSearch) =>
                    void updateRoleCompanyFirstSearch({
                      isCompanyFirstSearch,
                      roleId: role.roleId,
                      roleName: role.name,
                    })
                  }
                />
                <span className="sr-only" aria-live="polite">
                  {pending ? "저장 중" : ""}
                </span>
              </div>
            </div>
            {role.status === "draft" ? (
              <MuteButton
                className="mt-3"
                size="sm"
                onClick={() => openRole(role)}
              >
                이어서 작성
              </MuteButton>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                <div className="py-2">
                  <p className="text-xs text-neutral-muted">전체 후보자</p>
                  <p className="mt-1 text-xl font-medium tabular-nums">
                    {total}
                  </p>
                </div>
                {stages.map((stage) => (
                  <MuteButton
                    key={stage.id}
                    variant="transparent"
                    className="block h-auto whitespace-normal rounded-none px-0 py-2 text-left hover:bg-transparent"
                    onClick={() => openRole(role, "pipeline")}
                  >
                    <span className="block text-xs text-neutral-muted">
                      {getRoleStageLabel(stage, role)}
                    </span>
                    <span className="mt-1 block text-xl font-medium tabular-nums text-neutral-primary">
                      {counts.get(`${role.roleId}:${stage.id}`) ?? 0}
                    </span>
                  </MuteButton>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
