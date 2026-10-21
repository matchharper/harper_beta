import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Info,
  Ellipsis,
  LoaderCircle,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgSection } from "./OrgSection";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgTeamChange } from "@/hooks/org/useOrgTeams";
import { useOrgSourceT, useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgMember, OrgRole } from "@/lib/org/server";
import { orgMemberTeamIds, type OrgTeam } from "@/lib/org/teamAccess.shared";
import {
  OrgTable,
  OrgTableBody,
  OrgTableCell,
  OrgTableHead,
  OrgTableHeader,
  OrgTableRow,
} from "./OrgTable";

export function OrgMemberTeamSelect({ member }: { member: OrgMember }) {
  const { c } = useOrgLocale();
  const { bootstrap, workspace, permissions } = useOrgWorkspace();
  const teams = bootstrap.teams ?? [];
  const change = useOrgTeamChange();
  const [open, setOpen] = useState(false);
  const selectedIds = orgMemberTeamIds(member);
  const allRoles =
    member.authority === "owner" || member.accessScope !== "team";
  const label = allRoles
    ? c("전체 Role", "All Roles")
    : teams
        .filter((team) => selectedIds.includes(team.teamId))
        .map((team) => team.name)
        .join(", ") || c("팀 배정 필요", "Team assignment needed");
  if (!permissions.canManageTeams || member.authority === "owner")
    return <span className="text-[12px] text-neutral-muted">{label}</span>;
  return (
    <>
      <MuteButton
        size="sm"
        className="max-w-full"
        onClick={() => setOpen(true)}
        aria-label={c("{name} 접근 범위", "Access for {name}", {
          name: member.name || member.email || "",
        })}
      >
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </MuteButton>
      {open ? (
        <OrgMemberAccessEditor
          member={member}
          teams={teams}
          pending={change.isPending}
          onClose={() => setOpen(false)}
          onSave={async (scope, teamIds) => {
            await change.mutateAsync({
              method: "PATCH",
              workspaceId: workspace.workspaceId,
              userId: member.userId,
              accessScope: scope,
              teamIds,
            });
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function OrgMemberAccessEditor({
  member,
  teams,
  pending,
  onClose,
  onSave,
}: {
  member: OrgMember;
  teams: OrgTeam[];
  pending: boolean;
  onClose: () => void;
  onSave: (scope: "organization" | "team", ids: string[]) => Promise<void>;
}) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const [allRoles, setAllRoles] = useState(member.accessScope !== "team");
  const [ids, setIds] = useState(orgMemberTeamIds(member));
  const [error, setError] = useState("");
  const defaultTeam = teams.find(
    (team) =>
      team.teamId ===
      (ids.includes(member.teamId ?? "") ? member.teamId : ids[0])
  );
  return (
    <TalentCareerModal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      mobileBottomSheet
      title={c("{name} 접근 범위", "Access for {name}", {
        name: member.name || member.email || "",
      })}
      panelClassName="max-w-[440px]"
      bodyClassName="px-5 pb-2"
      closeOnBackdrop={!pending}
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton disabled={pending} onClick={onClose}>
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            variant="dark"
            disabled={pending}
            onClick={async () => {
              setError("");
              try {
                await onSave(
                  allRoles ? "organization" : "team",
                  allRoles ? [] : ids
                );
              } catch (cause) {
                setError(
                  sourceT(
                    cause instanceof Error
                      ? cause.message
                      : c(
                          "팀 설정을 저장하지 못했습니다.",
                          "Could not save team settings."
                        )
                  )
                );
              }
            }}
          >
            {c("변경 저장", "Save changes")}
          </MuteButton>
        </div>
      }
    >
      <div className="space-y-4">
        <Checkbox
          label={c("전체 Role", "All Roles")}
          checked={allRoles}
          disabled={pending}
          onChange={(event) => {
            setAllRoles(event.target.checked);
            if (event.target.checked) setIds([]);
          }}
        />
        <div className="space-y-3 border-t border-neutral-1000-a05 pt-4">
          {teams.map((team) => (
            <Checkbox
              key={team.teamId}
              className="flex"
              label={team.name}
              disabled={pending}
              checked={!allRoles && ids.includes(team.teamId)}
              onChange={(event) => {
                setAllRoles(false);
                setIds(
                  event.target.checked
                    ? [...new Set([...ids, team.teamId])]
                    : ids.filter((id) => id !== team.teamId)
                );
              }}
            />
          ))}
        </div>
        {!allRoles && defaultTeam && member.authority === "admin" ? (
          <p className="text-[12px] leading-5 text-neutral-muted">
            {c(
              "새 Role은 {name}에 자동 배정돼요.",
              "New Roles are automatically assigned to {name}.",
              {
                name: defaultTeam.name,
              }
            )}
          </p>
        ) : null}
        {!allRoles && !ids.length ? (
          <p className="text-[12px] text-neutral-muted">
            {c(
              "팀을 배정하기 전까지 Role에 접근할 수 없어요.",
              "No Role access until a team is assigned."
            )}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[12px] text-critical">
            {error}
          </p>
        ) : null}
      </div>
    </TalentCareerModal>
  );
}

export function OrgTeamsSection() {
  const { c } = useOrgLocale();
  const { bootstrap, permissions, currentUser } = useOrgWorkspace();
  const teams = bootstrap.teams ?? [];
  const [editing, setEditing] = useState<OrgTeam | null>(null);

  return (
    <OrgSection>
      <p className="mb-6 text-[13px] leading-5 text-neutral-muted">
        {c(
          "팀에 배정된 팀원은 해당 팀의 Role에 접근할 수 있어요.",
          "Assigned team members can access this team’s Roles."
        )}
      </p>
      {currentUser?.authority === "owner" ? (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-info/10 px-3 py-2.5 text-[13px] text-neutral-muted">
          <Info className="size-4 shrink-0" aria-hidden />
          {c(
            "Owner 권한으로 모든 팀과 Role에 접근할 수 있어요.",
            "As an Owner, you can access every team and Role."
          )}
        </div>
      ) : null}
      {teams.length ? (
        <OrgTable>
          <OrgTableHeader>
            <OrgTableRow>
              <OrgTableHead>{c("팀 이름", "Team name")}</OrgTableHead>
              <OrgTableHead className="w-20 text-right">
                {c("팀원", "Team members")}
              </OrgTableHead>
              <OrgTableHead className="w-20 text-right">Role</OrgTableHead>
              {permissions.canManageTeams ? (
                <OrgTableHead className="w-12">
                  <span className="sr-only">
                    {c("팀 설정 메뉴", "Team settings menu")}
                  </span>
                </OrgTableHead>
              ) : null}
            </OrgTableRow>
          </OrgTableHeader>
          <OrgTableBody>
            {teams.map((team) => {
              const members = bootstrap.members.filter(
                (member) =>
                  member.accessScope === "team" &&
                  orgMemberTeamIds(member).includes(team.teamId)
              );
              const roles = (bootstrap.teamRoles ?? bootstrap.roles).filter(
                (role) => role.teamId === team.teamId
              );
              return (
                <OrgTableRow
                  key={team.teamId}
                  className={
                    permissions.canManageTeams
                      ? "cursor-pointer hover:bg-neutral-50"
                      : undefined
                  }
                  onClick={
                    permissions.canManageTeams
                      ? () => setEditing(team)
                      : undefined
                  }
                >
                  <OrgTableCell className="max-w-40 py-3 sm:max-w-none">
                    <span className="truncate text-black font-normal text-base">
                      {team.name}
                    </span>
                    <p className="mt-1 truncate text-[12px] text-neutral-muted">
                      {members
                        .map((member) => member.name || member.email)
                        .join(" · ") ||
                        c("배정된 팀원 없음", "No team members assigned")}
                    </p>
                  </OrgTableCell>
                  <OrgTableCell className="text-right tabular-nums">
                    {members.length}
                  </OrgTableCell>
                  <OrgTableCell className="text-right tabular-nums">
                    {roles.length}
                  </OrgTableCell>
                  {permissions.canManageTeams ? (
                    <OrgTableCell>
                      <ChevronRight
                        className="size-4 text-neutral-soft"
                        aria-hidden
                      />
                    </OrgTableCell>
                  ) : null}
                </OrgTableRow>
              );
            })}
          </OrgTableBody>
        </OrgTable>
      ) : (
        <div className="py-12 text-center">
          <p className="text-[14px] text-neutral-primary">
            {c(
              "팀 없이도 모든 채용 기능을 사용할 수 있어요.",
              "You can use all hiring features without creating a team."
            )}
          </p>
          <p className="mt-2 text-[13px] text-neutral-muted">
            {c(
              "Role별 접근을 나눠야 할 때 팀을 만들어 주세요.",
              "Create a team when you need to separate access to Roles."
            )}
          </p>
        </div>
      )}
      {editing ? (
        <OrgTeamEditor
          key={editing.teamId}
          team={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </OrgSection>
  );
}

type TeamSelectionItem = { id: string; name: string; detail: string };

function TeamSelection({
  label,
  open,
  onToggle,
  items,
  selectedIds,
  onSelectionChange,
  disabled,
  hint,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: TeamSelectionItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled: boolean;
  hint?: ReactNode;
}) {
  const { c } = useOrgLocale();
  const listId = useId();
  const [query, setQuery] = useState("");
  const selected = items.filter((item) => selectedIds.includes(item.id));
  const visibleItems = items.filter((item) =>
    `${item.name} ${item.detail}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase())
  );
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-neutral-primary">{label}</p>
      <MuteButton
        className="min-h-11 w-full justify-between px-3 py-2.5 text-left"
        disabled={disabled}
        aria-label={c("{label} 선택", "Select {label}", { label })}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={onToggle}
      >
        <span className="min-w-0 truncate font-normal">
          {selected.length
            ? selected.map((item) => item.name).join(", ")
            : c("선택해 주세요", "Select items")}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-neutral-soft">
          {selected.length > 0 ? (
            <span className="text-[12px] tabular-nums">{selected.length}</span>
          ) : null}
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </MuteButton>
      {open ? (
        <div
          id={listId}
          className="rounded-md border border-neutral-1000-a10 p-1"
        >
          {items.length > 6 ? (
            <div className="p-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={c("{label} 검색", "Search {label}", { label })}
                placeholder={c("이름으로 검색", "Search by name")}
              />
            </div>
          ) : null}
          <div
            className="max-h-56 overflow-y-auto overscroll-contain"
            role="group"
            aria-label={label}
          >
            {visibleItems.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-3 rounded px-3 py-2.5 hover:bg-bg-weak"
              >
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  disabled={disabled}
                  aria-label={item.name}
                  onChange={() =>
                    onSelectionChange(
                      selectedIds.includes(item.id)
                        ? selectedIds.filter((id) => id !== item.id)
                        : [...selectedIds, item.id]
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-neutral-primary">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-neutral-soft">
                    {item.detail}
                  </span>
                </span>
              </label>
            ))}
            {!visibleItems.length ? (
              <p className="px-3 py-6 text-[12px] text-neutral-muted">
                {c("검색 결과가 없습니다.", "No results found.")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {hint ? (
        <p className="text-[12px] leading-5 text-neutral-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function OrgTeamEditor({
  team,
  onClose,
}: {
  team: OrgTeam | null;
  onClose: () => void;
}) {
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const formId = useId();
  const { bootstrap, workspace } = useOrgWorkspace();
  const teams = bootstrap.teams ?? [];
  const [name, setName] = useState(team?.name ?? "");
  const [userIds, setUserIds] = useState(() =>
    bootstrap.members
      .filter(
        (member) =>
          member.accessScope === "team" &&
          orgMemberTeamIds(member).includes(team?.teamId ?? "") &&
          team
      )
      .map((member) => member.userId)
  );
  const [roleIds, setRoleIds] = useState(() =>
    (bootstrap.teamRoles ?? bootstrap.roles)
      .filter((role) => role.teamId === team?.teamId && team)
      .map((role) => role.roleId)
  );
  const [openSelection, setOpenSelection] = useState<
    "members" | "roles" | null
  >(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [error, setError] = useState("");
  const change = useOrgTeamChange();
  const groupLabel = (id: string | null | undefined) =>
    teams.find((item) => item.teamId === id)?.name;
  const members = bootstrap.members.filter(
    (member) => member.authority !== "owner"
  );
  const roles = bootstrap.teamRoles ?? bootstrap.roles;
  const selectedElsewhere = (
    role: Pick<OrgRole, "roleId" | "name" | "teamId">
  ) =>
    Boolean(
      role.teamId &&
      role.teamId !== team?.teamId &&
      roleIds.includes(role.roleId)
    );
  const movedRoles = (bootstrap.teamRoles ?? bootstrap.roles).filter(
    selectedElsewhere
  ).length;
  const restrictedMembers = bootstrap.members.filter(
    (member) => userIds.includes(member.userId) && member.accessScope !== "team"
  ).length;
  const removedMembers = bootstrap.members.filter(
    (member) =>
      team &&
      orgMemberTeamIds(member).includes(team.teamId) &&
      orgMemberTeamIds(member).length === 1 &&
      member.accessScope === "team" &&
      !userIds.includes(member.userId)
  ).length;
  const removedRoles = roles.filter(
    (role) =>
      team && role.teamId === team.teamId && !roleIds.includes(role.roleId)
  ).length;
  const existingRoles = (bootstrap.teamRoles ?? bootstrap.roles).filter(
    (role) => team && role.teamId === team.teamId
  ).length;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (change.isPending) return;
    if (!name.trim()) {
      setError(c("팀 이름을 입력해 주세요.", "Enter a team name."));
      return;
    }
    setError("");
    try {
      await change.mutateAsync({
        method: team ? "PATCH" : "POST",
        workspaceId: workspace.workspaceId,
        teamId: team?.teamId,
        name: name.trim(),
        userIds,
        roleIds,
      });
      onClose();
    } catch (cause) {
      setError(
        sourceT(
          cause instanceof Error
            ? cause.message
            : c(
                "팀 설정을 저장하지 못했습니다.",
                "Could not save team settings."
              )
        )
      );
    }
  }
  async function remove() {
    if (!team || change.isPending) return;
    setError("");
    try {
      await change.mutateAsync({
        method: "DELETE",
        workspaceId: workspace.workspaceId,
        teamId: team.teamId,
      });
      onClose();
    } catch (cause) {
      setError(
        sourceT(
          cause instanceof Error
            ? cause.message
            : c(
                "팀 설정을 저장하지 못했습니다.",
                "Could not save team settings."
              )
        )
      );
    }
  }
  return (
    <TalentCareerModal
      open
      onClose={() => {
        if (!change.isPending) onClose();
      }}
      mobileBottomSheet
      title={
        deleteMode
          ? c("{name} 삭제", "Delete {name}", { name: team?.name || "" })
          : team
            ? team.name
            : c("팀 만들기", "Create team")
      }
      description={
        deleteMode
          ? c(
              "팀을 삭제해도 다른 팀의 배정은 유지돼요.",
              "Assignments to other teams are preserved when this team is deleted."
            )
          : c(
              "팀원과 이 팀에서 관리할 Role을 선택하세요.",
              "Choose team members and the Roles they can access. Owners can access every Role."
            )
      }
      panelClassName="max-w-[480px]"
      bodyClassName="px-5 pb-5"
      closeOnBackdrop={!change.isPending}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {team && !deleteMode ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <MuteButton
                    variant="transparent"
                    size="sm"
                    disabled={change.isPending}
                    aria-label={c("팀 설정 메뉴", "Team settings menu")}
                  >
                    <Ellipsis className="size-4" />
                  </MuteButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    tone="danger"
                    onSelect={() => {
                      setDeleteMode(true);
                      setError("");
                    }}
                  >
                    {c("팀 삭제", "Delete team")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <MuteButton
              disabled={change.isPending}
              onClick={() => (deleteMode ? setDeleteMode(false) : onClose())}
            >
              {c("취소", "Cancel")}
            </MuteButton>
            {deleteMode ? (
              <MuteButton
                variant="warn"
                disabled={change.isPending || existingRoles > 0}
                onClick={() => void remove()}
              >
                {c("팀 삭제", "Delete team")}
              </MuteButton>
            ) : (
              <MuteButton
                variant="dark"
                disabled={change.isPending || !name.trim()}
                type="submit"
                form={formId}
              >
                {change.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {team
                  ? c("변경 저장", "Save changes")
                  : c("팀 만들기", "Create team")}
              </MuteButton>
            )}
          </div>
        </div>
      }
    >
      {deleteMode ? (
        <p className="text-[13px] text-neutral-muted">
          {existingRoles > 0
            ? c(
                "배정된 Role을 다른 팀 또는 미배정으로 옮긴 뒤 팀을 삭제해 주세요.",
                "Move assigned Roles to another team or leave them unassigned before deleting this team."
              )
            : c(
                "다른 팀에 배정되지 않은 팀원은 새 팀을 배정받기 전까지 Role에 접근할 수 없어요.",
                "Team members with no other team assignments cannot access Roles until a new team is assigned."
              )}
        </p>
      ) : (
        <form
          id={formId}
          onSubmit={(event) => void save(event)}
          className="space-y-5"
        >
          <label className="grid gap-2 text-[13px] font-medium">
            <span>{c("팀 이름", "Team name")}</span>
            <Input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder={c("예: 개발팀", "For example, Engineering")}
              disabled={change.isPending}
            />
          </label>
          <TeamSelection
            label={c("팀원", "Team members")}
            open={openSelection === "members"}
            onToggle={() =>
              setOpenSelection(openSelection === "members" ? null : "members")
            }
            selectedIds={userIds}
            onSelectionChange={setUserIds}
            disabled={change.isPending}
            items={members.map((member) => ({
              id: member.userId,
              name: member.name || member.email || member.userId,
              detail: `${member.accessScope === "team" ? orgMemberTeamIds(member).map(groupLabel).filter(Boolean).join(", ") || c("팀 배정 필요", "Team assignment needed") : c("전체 Role", "All Roles")} · ${member.authority === "admin" ? "Admin" : "Viewer"}`,
            }))}
            hint={
              restrictedMembers > 0 || removedMembers > 0 ? (
                <>
                  {restrictedMembers > 0 ? (
                    <span className="block">
                      {c(
                        "선택한 팀원 {count}명의 접근 범위가 이 팀으로 변경돼요.",
                        "Access for {count} selected team members will be limited to this team.",
                        { count: restrictedMembers }
                      )}
                    </span>
                  ) : null}
                  {removedMembers > 0 ? (
                    <span className="block">
                      {c(
                        "제외한 팀원 {count}명은 새 팀을 배정받기 전까지 Role에 접근할 수 없어요.",
                        "{count} removed team members cannot access any Roles until they are assigned to a new team.",
                        { count: removedMembers }
                      )}
                    </span>
                  ) : null}
                </>
              ) : undefined
            }
          />
          <TeamSelection
            label="Role"
            open={openSelection === "roles"}
            onToggle={() =>
              setOpenSelection(openSelection === "roles" ? null : "roles")
            }
            selectedIds={roleIds}
            onSelectionChange={setRoleIds}
            disabled={change.isPending}
            items={roles.map((role) => ({
              id: role.roleId,
              name: role.name,
              detail: groupLabel(role.teamId) || c("미배정", "Unassigned"),
            }))}
            hint={
              movedRoles > 0 || removedRoles > 0 ? (
                <>
                  {movedRoles > 0 ? (
                    <span className="block">
                      {c(
                        "다른 팀의 Role {count}개가 이 팀으로 이동해요.",
                        "{count} Roles from other teams will move to this team.",
                        { count: movedRoles }
                      )}
                    </span>
                  ) : null}
                  {removedRoles > 0 ? (
                    <span className="block">
                      {c(
                        "제외한 Role {count}개는 전체 Role 접근 권한이 있는 팀원만 볼 수 있어요.",
                        "{count} removed Roles will only be visible to team members with access to all Roles.",
                        { count: removedRoles }
                      )}
                    </span>
                  ) : null}
                </>
              ) : (
                ""
              )
            }
          />
        </form>
      )}
      {error ? (
        <p role="alert" className="text-[12px] text-critical">
          {error}
        </p>
      ) : null}
    </TalentCareerModal>
  );
}
