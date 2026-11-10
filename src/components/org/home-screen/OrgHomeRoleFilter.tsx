import { CompactDropdown } from "@/components/ui/compact-dropdown";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

/** The one role filter of Home: 소식 (with its 할 일) and 역할 show every role, or this one. */
export function OrgHomeRoleFilter({
  onChange,
  roleId,
}: {
  onChange: (roleId: string | null) => void;
  roleId: string | null;
}) {
  const { c } = useOrgLocale();
  const { roles } = useOrgWorkspace();
  const all = "__all__";
  return (
    <div className="org-home-role-filter">
      <CompactDropdown<string>
        ariaLabel={c("볼 역할", "Role to show")}
        className="w-auto max-w-[240px]"
        onValueChange={(value) => onChange(value === all ? null : value)}
        options={[
          { value: all, label: c("모든 역할", "All roles") },
          ...roles.map((role) => ({ value: role.roleId, label: role.name })),
        ]}
        value={roleId && roles.some((role) => role.roleId === roleId) ? roleId : all}
      />
    </div>
  );
}
