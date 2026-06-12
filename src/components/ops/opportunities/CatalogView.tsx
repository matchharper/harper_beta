import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpsOpportunityRoleRecord,
  OpsOpportunityWorkspaceRecord,
} from "@/lib/opsOpportunity";
import {
  AlertCircle,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { EmptyState, PanelHeader, RoleOptionCard, Token } from "./shared";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";

type CatalogViewProps = {
  catalogErrorMessage?: string | null;
  catalogLoading: boolean;
  filteredRoles: OpsOpportunityRoleRecord[];
  filteredWorkspaces: OpsOpportunityWorkspaceRecord[];
  onLoadMoreRoles: () => void;
  onLoadMoreWorkspaces: () => void;
  onRoleEdit: (role: OpsOpportunityRoleRecord) => void;
  onOpenRoleCreateModal: () => void;
  onOpenRoleEditModal: () => void;
  onOpenWorkspaceCreateModal: () => void;
  onOpenWorkspaceEditModal: () => void;
  onRoleSearchChange: (value: string) => void;
  onRoleSearchSubmit: () => void;
  onRoleSelect: (roleId: string) => void;
  onRoleSync: () => void;
  onWorkspaceSearchChange: (value: string) => void;
  onWorkspaceSearchSubmit: () => void;
  onWorkspaceSelect: (workspaceId: string) => void;
  roleSearch: string;
  roleLoading: boolean;
  roleTotalCount: number;
  selectedRoleId: string | null;
  selectedWorkspace: OpsOpportunityWorkspaceRecord | null;
  selectedWorkspaceId: string | null;
  syncRolePending: boolean;
  workspaceSearch: string;
  workspaceTotalCount: number;
};

export default function CatalogView({
  catalogErrorMessage,
  catalogLoading,
  filteredRoles,
  filteredWorkspaces,
  onLoadMoreRoles,
  onLoadMoreWorkspaces,
  onRoleEdit,
  onOpenRoleCreateModal,
  onOpenRoleEditModal,
  onOpenWorkspaceCreateModal,
  onOpenWorkspaceEditModal,
  onRoleSearchChange,
  onRoleSearchSubmit,
  onRoleSelect,
  onRoleSync,
  onWorkspaceSearchChange,
  onWorkspaceSearchSubmit,
  onWorkspaceSelect,
  roleSearch,
  roleLoading,
  roleTotalCount,
  selectedRoleId,
  selectedWorkspace,
  selectedWorkspaceId,
  syncRolePending,
  workspaceSearch,
  workspaceTotalCount,
}: CatalogViewProps) {
  const hasMoreWorkspaces = filteredWorkspaces.length < workspaceTotalCount;
  const hasMoreRoles = filteredRoles.length < roleTotalCount;
  const showLoadMoreRoles =
    hasMoreRoles &&
    !roleLoading &&
    !catalogErrorMessage &&
    Boolean(selectedWorkspaceId);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(300px,420px)_minmax(0,1fr)]">
      {catalogErrorMessage ? (
        <div
          className={cx(
            opsTheme.errorNotice,
            "flex items-start gap-2 xl:col-span-2"
          )}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>목록을 불러오지 못했습니다: {catalogErrorMessage}</span>
        </div>
      ) : null}
      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader
          title="회사"
          action={
            <div className="flex items-center gap-2">
              <BareButton
                type="button"
                onClick={onOpenWorkspaceEditModal}
                disabled={!selectedWorkspaceId}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <Pencil className="h-4 w-4" />
                수정
              </BareButton>
              <BareButton
                type="button"
                onClick={onOpenWorkspaceCreateModal}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <Plus className="h-4 w-4" />
                추가
              </BareButton>
            </div>
          }
        />
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onWorkspaceSearchSubmit();
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
            <UiInput
              unstyled
              value={workspaceSearch}
              onChange={(event) => onWorkspaceSearchChange(event.target.value)}
              placeholder="회사명, 링크, 소개 검색"
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
        {!catalogLoading && !catalogErrorMessage ? (
          <div className="text-xs text-neutral-muted">
            {filteredWorkspaces.length} / {workspaceTotalCount}개 회사
          </div>
        ) : null}
        <div className="space-y-2">
          {catalogLoading ? (
            <EmptyState copy="회사 목록을 불러오는 중입니다." />
          ) : catalogErrorMessage ? (
            <EmptyState copy="회사 목록을 새로고침해 주세요." />
          ) : filteredWorkspaces.length === 0 ? (
            <EmptyState copy="조건에 맞는 회사가 없습니다." />
          ) : (
            filteredWorkspaces.map((workspace) => {
              const active =
                workspace.companyWorkspaceId === selectedWorkspaceId;
              return (
                <BareButton
                  key={workspace.companyWorkspaceId}
                  type="button"
                  onClick={() =>
                    onWorkspaceSelect(workspace.companyWorkspaceId)
                  }
                  className={cx(
                    "w-full rounded-md px-3 py-3 text-left transition",
                    active
                      ? "bg-black text-neutral-00"
                      : "bg-bg-default/65 text-neutral-primary hover:bg-bg-default"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {workspace.companyName}
                      </div>
                      <div
                        className={cx(
                          "mt-1 text-xs",
                          active ? "text-neutral-00/70" : "text-neutral-muted"
                        )}
                      >
                        {workspace.internalRoleCount} internal roles
                      </div>
                    </div>
                    <Token active={active}>
                      {workspace.activeRoleCount} active
                    </Token>
                  </div>
                  {workspace.companyDescription ? (
                    <div
                      className={cx(
                        "mt-2 line-clamp-2 text-xs leading-5",
                        active ? "text-neutral-00/70" : "text-neutral-muted"
                      )}
                    >
                      {workspace.companyDescription}
                    </div>
                  ) : null}
                </BareButton>
              );
            })
          )}
        </div>
        {hasMoreWorkspaces && !catalogLoading && !catalogErrorMessage ? (
          <BareButton
            type="button"
            onClick={onLoadMoreWorkspaces}
            className={cx(opsTheme.buttonSecondary, "h-10 w-full")}
          >
            <ChevronDown className="h-4 w-4" />
            더보기
          </BareButton>
        ) : null}
      </div>

      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader
          title="기회"
          action={
            <div className="flex items-center gap-2">
              <BareButton
                type="button"
                disabled={
                  !selectedWorkspaceId ||
                  syncRolePending ||
                  !String(selectedWorkspace?.careerUrl ?? "").trim()
                }
                onClick={onRoleSync}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <RefreshCw
                  className={cx(
                    "h-4 w-4",
                    syncRolePending ? "animate-spin" : ""
                  )}
                />
                Sync
              </BareButton>
              <BareButton
                type="button"
                disabled={!selectedWorkspaceId || !selectedRoleId}
                onClick={onOpenRoleEditModal}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <Pencil className="h-4 w-4" />
                수정
              </BareButton>
              <BareButton
                type="button"
                disabled={!selectedWorkspaceId || syncRolePending}
                onClick={onOpenRoleCreateModal}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <Plus className="h-4 w-4" />
                추가
              </BareButton>
            </div>
          }
        />
        <form
          className="grid gap-2 lg:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onRoleSearchSubmit();
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
            <UiInput
              unstyled
              value={roleSearch}
              onChange={(event) => onRoleSearchChange(event.target.value)}
              placeholder="role, company, location 검색"
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
        {!roleLoading && selectedWorkspaceId && !catalogErrorMessage ? (
          <div className="text-xs text-neutral-muted">
            {filteredRoles.length} / {roleTotalCount}개 기회
          </div>
        ) : null}
        {catalogErrorMessage ? (
          <EmptyState copy="기회 목록을 새로고침해 주세요." />
        ) : !selectedWorkspaceId ? (
          <EmptyState copy="먼저 회사를 선택해 주세요." />
        ) : roleLoading ? (
          <EmptyState copy="기회 목록을 불러오는 중입니다." />
        ) : filteredRoles.length === 0 ? (
          <EmptyState copy="이 회사에 표시할 기회가 없습니다." />
        ) : (
          <div className="space-y-2">
            {filteredRoles.map((role) => (
              <RoleOptionCard
                key={role.roleId}
                role={role}
                active={role.roleId === selectedRoleId}
                onSelect={() => onRoleSelect(role.roleId)}
                onEdit={() => onRoleEdit(role)}
              />
            ))}
          </div>
        )}
        {showLoadMoreRoles ? (
          <BareButton
            type="button"
            onClick={onLoadMoreRoles}
            className={cx(opsTheme.buttonSecondary, "h-10 w-full")}
          >
            <ChevronDown className="h-4 w-4" />
            더보기
          </BareButton>
        ) : null}
      </div>
    </section>
  );
}
