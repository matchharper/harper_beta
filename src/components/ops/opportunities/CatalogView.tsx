import { cx, opsTheme } from "@/components/ops/theme";
import type {
  OpsOpportunityRoleRecord,
  OpsOpportunityWorkspaceRecord,
  OpportunityEmploymentType,
  OpportunityStatus,
  OpportunityWorkMode,
} from "@/lib/opsOpportunity";
import { Plus, RefreshCw, Save, Search } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  ActionButton,
  type DraftMode,
  EMPLOYMENT_LABEL,
  EmptyState,
  formatUpdatedAt,
  PanelHeader,
  RoleOptionCard,
  type RoleDraft,
  SOURCE_LABEL,
  type SourceFilter,
  STATUS_LABEL,
  Token,
  toggleEmploymentType,
  ToggleGrid,
  WORK_MODE_LABEL,
  type WorkspaceDraft,
} from "./shared";

type CatalogViewProps = {
  catalogLoading: boolean;
  extractWorkspacePending: boolean;
  filteredRoles: OpsOpportunityRoleRecord[];
  filteredWorkspaces: OpsOpportunityWorkspaceRecord[];
  onOpenRoleCreateModal: () => void;
  onOpenRoleFlow: (role: OpsOpportunityRoleRecord) => void;
  onOpenWorkspaceCreateModal: () => void;
  onResetRoleDraft: () => void;
  onResetWorkspaceDraft: () => void;
  onRoleSave: () => void;
  onRoleSearchChange: (value: string) => void;
  onRoleSelect: (roleId: string) => void;
  onRoleSync: () => void;
  onRoleSourceFilterChange: (filter: SourceFilter) => void;
  onWorkspaceExtract: () => void;
  onWorkspaceSave: () => void;
  onWorkspaceSearchChange: (value: string) => void;
  onWorkspaceSelect: (workspaceId: string) => void;
  roleDraft: RoleDraft;
  roleDraftMode: DraftMode;
  roleSearch: string;
  roleSourceFilter: SourceFilter;
  saveRolePending: boolean;
  saveWorkspacePending: boolean;
  selectedRole: OpsOpportunityRoleRecord | null;
  selectedRoleId: string | null;
  selectedWorkspace: OpsOpportunityWorkspaceRecord | null;
  selectedWorkspaceId: string | null;
  setRoleDraft: Dispatch<SetStateAction<RoleDraft>>;
  setWorkspaceDraft: Dispatch<SetStateAction<WorkspaceDraft>>;
  syncRolePending: boolean;
  workspaceDraft: WorkspaceDraft;
  workspaceDraftMode: DraftMode;
  workspaceSearch: string;
};

export default function CatalogView({
  catalogLoading,
  extractWorkspacePending,
  filteredRoles,
  filteredWorkspaces,
  onOpenRoleCreateModal,
  onOpenRoleFlow,
  onOpenWorkspaceCreateModal,
  onResetRoleDraft,
  onResetWorkspaceDraft,
  onRoleSave,
  onRoleSearchChange,
  onRoleSelect,
  onRoleSync,
  onRoleSourceFilterChange,
  onWorkspaceExtract,
  onWorkspaceSave,
  onWorkspaceSearchChange,
  onWorkspaceSelect,
  roleDraft,
  roleDraftMode,
  roleSearch,
  roleSourceFilter,
  saveRolePending,
  saveWorkspacePending,
  selectedRole,
  selectedRoleId,
  selectedWorkspace,
  selectedWorkspaceId,
  setRoleDraft,
  setWorkspaceDraft,
  syncRolePending,
  workspaceDraft,
  workspaceDraftMode,
  workspaceSearch,
}: CatalogViewProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_600px]">
      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader
          title="회사"
          action={
            <button
              type="button"
              onClick={onOpenWorkspaceCreateModal}
              className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
            >
              <Plus className="h-4 w-4" />
              추가
            </button>
          }
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
          <input
            value={workspaceSearch}
            onChange={(event) => onWorkspaceSearchChange(event.target.value)}
            placeholder="회사명, 링크, 소개 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="space-y-2">
          {catalogLoading ? (
            <EmptyState copy="회사 목록을 불러오는 중입니다." />
          ) : filteredWorkspaces.length === 0 ? (
            <EmptyState copy="조건에 맞는 회사가 없습니다." />
          ) : (
            filteredWorkspaces.map((workspace) => {
              const active =
                workspace.companyWorkspaceId === selectedWorkspaceId &&
                workspaceDraftMode === "edit";
              return (
                <button
                  key={workspace.companyWorkspaceId}
                  type="button"
                  onClick={() =>
                    onWorkspaceSelect(workspace.companyWorkspaceId)
                  }
                  className={cx(
                    "w-full rounded-md px-3 py-3 text-left transition",
                    active
                      ? "bg-beige900 text-beige100"
                      : "bg-white/65 text-beige900 hover:bg-white"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-geist text-sm font-medium">
                        {workspace.companyName}
                      </div>
                      <div
                        className={cx(
                          "mt-1 text-xs",
                          active ? "text-beige100/70" : "text-beige900/50"
                        )}
                      >
                        {workspace.totalRoleCount} roles
                      </div>
                    </div>
                    <Token active={active}>
                      {workspace.internalRoleCount}/
                      {workspace.externalRoleCount}
                    </Token>
                  </div>
                  {workspace.companyDescription ? (
                    <div
                      className={cx(
                        "mt-2 line-clamp-2 text-xs leading-5",
                        active ? "text-beige100/70" : "text-beige900/60"
                      )}
                    >
                      {workspace.companyDescription}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
        <PanelHeader
          title="기회"
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={
                  !selectedWorkspaceId ||
                  syncRolePending ||
                  !(
                    workspaceDraft.careerUrl.trim() ||
                    String(selectedWorkspace?.careerUrl ?? "").trim()
                  )
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
              </button>
              <button
                type="button"
                disabled={!selectedWorkspaceId || syncRolePending}
                onClick={onOpenRoleCreateModal}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <Plus className="h-4 w-4" />
                추가
              </button>
            </div>
          }
        />
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
            <input
              value={roleSearch}
              onChange={(event) => onRoleSearchChange(event.target.value)}
              placeholder="role, company, location 검색"
              className={cx(opsTheme.input, "pl-9")}
            />
          </div>
          <div className="flex gap-2">
            <ActionButton
              active={roleSourceFilter === "all"}
              onClick={() => onRoleSourceFilterChange("all")}
            >
              전체
            </ActionButton>
            <ActionButton
              active={roleSourceFilter === "internal"}
              onClick={() => onRoleSourceFilterChange("internal")}
            >
              내부
            </ActionButton>
            <ActionButton
              active={roleSourceFilter === "external"}
              onClick={() => onRoleSourceFilterChange("external")}
            >
              외부
            </ActionButton>
          </div>
        </div>
        {!selectedWorkspaceId ? (
          <EmptyState copy="먼저 회사를 선택해 주세요." />
        ) : filteredRoles.length === 0 ? (
          <EmptyState copy="이 회사에 표시할 기회가 없습니다." />
        ) : (
          <div className="space-y-2">
            {filteredRoles.map((role) => (
              <RoleOptionCard
                key={role.roleId}
                role={role}
                active={
                  role.roleId === selectedRoleId && roleDraftMode === "edit"
                }
                onSelect={() => onRoleSelect(role.roleId)}
                action={
                  <button
                    type="button"
                    onClick={() => onOpenRoleFlow(role)}
                    className={cx(
                      "rounded-md px-2 py-1 font-geist text-[11px] transition",
                      role.roleId === selectedRoleId && roleDraftMode === "edit"
                        ? "bg-white/10 text-beige100 hover:bg-white/20"
                        : "bg-beige500/80 text-beige900 hover:bg-beige500/95"
                    )}
                  >
                    {role.sourceType === "internal" ? "회사" : "후보자"}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
          <PanelHeader
            title={workspaceDraftMode === "edit" ? "회사 수정" : "회사 추가"}
            action={
              workspaceDraftMode === "new" ? (
                <button
                  type="button"
                  onClick={onResetWorkspaceDraft}
                  className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
                >
                  <RefreshCw className="h-4 w-4" />
                  되돌리기
                </button>
              ) : null
            }
          />
          <input
            value={workspaceDraft.companyName}
            onChange={(event) =>
              setWorkspaceDraft((current) => ({
                ...current,
                companyName: event.target.value,
              }))
            }
            placeholder="회사명"
            className={opsTheme.input}
          />
          <input
            value={workspaceDraft.homepageUrl}
            onChange={(event) =>
              setWorkspaceDraft((current) => ({
                ...current,
                homepageUrl: event.target.value,
              }))
            }
            placeholder="homepage"
            className={opsTheme.input}
          />
          <input
            value={workspaceDraft.linkedinUrl}
            onChange={(event) =>
              setWorkspaceDraft((current) => ({
                ...current,
                linkedinUrl: event.target.value,
              }))
            }
            placeholder="linkedin company url"
            className={opsTheme.input}
          />
          <button
            type="button"
            onClick={onWorkspaceExtract}
            disabled={
              extractWorkspacePending || !workspaceDraft.linkedinUrl.trim()
            }
            className={cx(opsTheme.buttonSecondary, "h-10 w-full")}
          >
            <RefreshCw
              className={cx(
                "h-4 w-4",
                extractWorkspacePending ? "animate-spin" : ""
              )}
            />
            추출하기
          </button>
          <input
            value={workspaceDraft.careerUrl}
            onChange={(event) =>
              setWorkspaceDraft((current) => ({
                ...current,
                careerUrl: event.target.value,
              }))
            }
            placeholder="career url"
            className={opsTheme.input}
          />
          <textarea
            value={workspaceDraft.companyDescription}
            onChange={(event) =>
              setWorkspaceDraft((current) => ({
                ...current,
                companyDescription: event.target.value,
              }))
            }
            placeholder="간단한 소개"
            className={cx(opsTheme.textarea, "min-h-[120px] px-3 py-3")}
          />
          {selectedWorkspace && workspaceDraftMode === "edit" ? (
            <div className="text-xs text-beige900/45">
              last edit · {formatUpdatedAt(selectedWorkspace.updatedAt)}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onWorkspaceSave}
            disabled={saveWorkspacePending || extractWorkspacePending}
            className={cx(opsTheme.buttonPrimary, "h-10 w-full")}
          >
            {saveWorkspacePending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            저장
          </button>
        </div>

        <div className={cx(opsTheme.panel, "space-y-3 p-4")}>
          <PanelHeader
            title={roleDraftMode === "edit" ? "기회 수정" : "기회 추가"}
            action={
              roleDraftMode === "new" ? (
                <button
                  type="button"
                  onClick={onResetRoleDraft}
                  className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
                >
                  <RefreshCw className="h-4 w-4" />
                  되돌리기
                </button>
              ) : null
            }
          />
          {!selectedWorkspaceId ? (
            <EmptyState copy="회사를 먼저 고르면 role을 바로 붙일 수 있습니다." />
          ) : (
            <>
              <input
                value={roleDraft.name}
                onChange={(event) =>
                  setRoleDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="role title"
                className={opsTheme.input}
              />
              <ToggleGrid>
                <ActionButton
                  active={roleDraft.sourceType === "internal"}
                  onClick={() =>
                    setRoleDraft((current) => ({
                      ...current,
                      sourceType: "internal",
                    }))
                  }
                >
                  내부
                </ActionButton>
                <ActionButton
                  active={roleDraft.sourceType === "external"}
                  onClick={() =>
                    setRoleDraft((current) => ({
                      ...current,
                      sourceType: "external",
                    }))
                  }
                >
                  외부
                </ActionButton>
              </ToggleGrid>
              <ToggleGrid>
                {(Object.keys(STATUS_LABEL) as OpportunityStatus[]).map(
                  (status) => (
                    <ActionButton
                      key={status}
                      active={roleDraft.status === status}
                      onClick={() =>
                        setRoleDraft((current) => ({
                          ...current,
                          status,
                        }))
                      }
                    >
                      {STATUS_LABEL[status]}
                    </ActionButton>
                  )
                )}
              </ToggleGrid>
              <ToggleGrid>
                {(
                  Object.keys(EMPLOYMENT_LABEL) as OpportunityEmploymentType[]
                ).map((type) => (
                  <ActionButton
                    key={type}
                    active={roleDraft.employmentTypes.includes(type)}
                    onClick={() =>
                      setRoleDraft((current) => ({
                        ...current,
                        employmentTypes: toggleEmploymentType(
                          current.employmentTypes,
                          type
                        ),
                      }))
                    }
                  >
                    {EMPLOYMENT_LABEL[type]}
                  </ActionButton>
                ))}
              </ToggleGrid>
              <ToggleGrid>
                <ActionButton
                  active={roleDraft.workMode === null}
                  onClick={() =>
                    setRoleDraft((current) => ({
                      ...current,
                      workMode: null,
                    }))
                  }
                >
                  미정
                </ActionButton>
                {(Object.keys(WORK_MODE_LABEL) as OpportunityWorkMode[]).map(
                  (mode) => (
                    <ActionButton
                      key={mode}
                      active={roleDraft.workMode === mode}
                      onClick={() =>
                        setRoleDraft((current) => ({
                          ...current,
                          workMode: mode,
                        }))
                      }
                    >
                      {WORK_MODE_LABEL[mode]}
                    </ActionButton>
                  )
                )}
              </ToggleGrid>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={roleDraft.sourceProvider}
                  onChange={(event) =>
                    setRoleDraft((current) => ({
                      ...current,
                      sourceProvider: event.target.value,
                    }))
                  }
                  placeholder="source provider"
                  className={opsTheme.input}
                />
                <input
                  value={roleDraft.sourceJobId}
                  onChange={(event) =>
                    setRoleDraft((current) => ({
                      ...current,
                      sourceJobId: event.target.value,
                    }))
                  }
                  placeholder="source job id"
                  className={opsTheme.input}
                />
              </div>
              <input
                value={roleDraft.externalJdUrl}
                onChange={(event) =>
                  setRoleDraft((current) => ({
                    ...current,
                    externalJdUrl: event.target.value,
                  }))
                }
                placeholder="external jd url"
                className={opsTheme.input}
              />
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  value={roleDraft.locationText}
                  onChange={(event) =>
                    setRoleDraft((current) => ({
                      ...current,
                      locationText: event.target.value,
                    }))
                  }
                  placeholder="location"
                  className={opsTheme.input}
                />
                <input
                  value={roleDraft.postedAt}
                  onChange={(event) =>
                    setRoleDraft((current) => ({
                      ...current,
                      postedAt: event.target.value,
                    }))
                  }
                  placeholder="posted at / YYYY-MM-DD"
                  className={opsTheme.input}
                />
                <input
                  value={roleDraft.expiresAt}
                  onChange={(event) =>
                    setRoleDraft((current) => ({
                      ...current,
                      expiresAt: event.target.value,
                    }))
                  }
                  placeholder="expires at / YYYY-MM-DD"
                  className={opsTheme.input}
                />
              </div>
              <textarea
                value={roleDraft.descriptionSummary}
                onChange={(event) =>
                  setRoleDraft((current) => ({
                    ...current,
                    descriptionSummary: event.target.value,
                  }))
                }
                placeholder="role description summary"
                className={cx(opsTheme.textarea, "min-h-[110px] px-3 py-3")}
              />
              <textarea
                value={roleDraft.description}
                onChange={(event) =>
                  setRoleDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="role description"
                className={cx(opsTheme.textarea, "min-h-[170px] px-3 py-3")}
              />
              {selectedRole ? (
                <div className="flex flex-wrap gap-1.5">
                  <Token>{SOURCE_LABEL[selectedRole.sourceType]}</Token>
                  <Token>{STATUS_LABEL[selectedRole.status]}</Token>
                </div>
              ) : null}
              <button
                type="button"
                onClick={onRoleSave}
                disabled={saveRolePending}
                className={cx(opsTheme.buttonPrimary, "h-10 w-full")}
              >
                {saveRolePending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                저장
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
