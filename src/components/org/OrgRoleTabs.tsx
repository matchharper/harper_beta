import { cx } from "@/components/ops/theme";
import type { OrgRole } from "@/lib/org/server";
import { OrgRoleActionsMenu } from "@/components/org/OrgRoleActionsMenu";

export function OrgRoleTabs({
  activeRoleId,
  onChange,
  onDeleteRole,
  onEditRole,
  onPauseRole,
  onResumeRole,
  roleActionPending,
  roles,
}: {
  activeRoleId: string;
  onChange: (roleId: string) => void;
  onDeleteRole: (role: OrgRole) => void;
  onEditRole: (roleId: string) => void;
  onPauseRole: (role: OrgRole) => void;
  onResumeRole: (role: OrgRole) => void;
  roleActionPending?: boolean;
  roles: OrgRole[];
}) {
  const getTabClassName = (selected: boolean, variant: "all" | "role") =>
    cx(
      "flex min-h-12 shrink-0 items-stretch justify-between rounded-md border-2 bg-bg-floating text-left outline-none transition-colors",
      variant === "all"
        ? "w-[96px] min-w-[96px] max-w-[96px]"
        : "w-[clamp(180px,22vw,240px)] min-w-[180px] max-w-[240px]",
      selected
        ? "border-primary text-primary"
        : "border-neutral-1000-a05 text-neutral-muted hover:border-primary hover:text-primary"
    );

  const getTabButtonClassName = (hasMenu: boolean) =>
    cx(
      "min-w-0 flex-1 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10",
      hasMenu ? "pr-1" : ""
    );

  return (
    <div className="relative -mx-1 px-1">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-bg-default to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-bg-default to-transparent" />
      <div className="w-full overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-1000-a10 hover:scrollbar-thumb-neutral-1000-a50">
        <div
          role="tablist"
          className="flex w-max min-w-full flex-row gap-2 pr-4"
        >
          <div className={getTabClassName(activeRoleId === "all", "all")}>
            <button
              type="button"
              role="tab"
              aria-selected={activeRoleId === "all"}
              onClick={() => onChange("all")}
              className={getTabButtonClassName(false)}
            >
              <span className="block min-w-0 truncate text-[13px] font-medium leading-5">
                All
              </span>
            </button>
          </div>
          {roles.map((role) => {
            const selected = activeRoleId === role.roleId;
            return (
              <div
                key={role.roleId}
                className={getTabClassName(selected, "role")}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onChange(role.roleId)}
                  className={getTabButtonClassName(true)}
                >
                  <span className="block min-w-0 truncate text-[13px] font-medium leading-5">
                    {role.name}
                  </span>
                </button>
                <div className="flex shrink-0 items-center pr-2">
                  <OrgRoleActionsMenu
                    role={role}
                    pending={roleActionPending}
                    onEdit={(selectedRole) => onEditRole(selectedRole.roleId)}
                    onPause={onPauseRole}
                    onResume={onResumeRole}
                    onDelete={onDeleteRole}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
