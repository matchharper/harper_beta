import { TabBoxes } from "@/components/ui/tab-boxes";
import type { OrgRole } from "@/lib/org/server";

export function OrgRoleTabs({
  activeRoleId,
  onChange,
  roles,
}: {
  activeRoleId: string;
  onChange: (roleId: string) => void;
  roles: OrgRole[];
}) {
  return (
    <TabBoxes
      activeValue={activeRoleId}
      items={[
        {
          label: "All",
          value: "all",
        },
        ...roles.map((role) => ({
          label: role.name,
          value: role.roleId,
        })),
      ]}
      listClassName="min-w-full"
      onValueChange={onChange}
      size="sm"
    />
  );
}
