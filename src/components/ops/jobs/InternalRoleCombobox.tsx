"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { OpsOfficialJobInternalRoleOption } from "@/lib/ops/officialJobs";
import { useMemo, useState } from "react";

type InternalRoleComboboxProps = {
  disabled?: boolean;
  isLoading?: boolean;
  onValueChange: (roleId: string) => void;
  roles: OpsOfficialJobInternalRoleOption[];
  value: string;
};

export default function InternalRoleCombobox({
  disabled = false,
  isLoading = false,
  onValueChange,
  roles,
  value,
}: InternalRoleComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedRole = useMemo(
    () => roles.find((role) => role.roleId === value) ?? null,
    [roles, value]
  );

  return (
    <div onMouseEnter={() => !disabled && setOpen(true)}>
      <Combobox
        items={roles}
        itemToStringLabel={(role) => role.label}
        itemToStringValue={(role) => role.roleId}
        open={open}
        onOpenChange={setOpen}
        value={selectedRole}
        onValueChange={(nextRole) => onValueChange(nextRole?.roleId ?? "")}
        autoHighlight
      >
        <ComboboxInput
          aria-label="Internal role"
          disabled={disabled}
          placeholder={
            isLoading ? "Internal role 불러오는 중..." : "Internal role 검색"
          }
          showClear={Boolean(value)}
          onMouseEnter={(event) => event.currentTarget.focus()}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {isLoading ? "불러오는 중..." : "일치하는 role이 없습니다."}
          </ComboboxEmpty>
          <ComboboxList>
            {(role) => (
              <ComboboxItem key={role.roleId} value={role}>
                <div className="min-w-0">
                  <div className="truncate">{role.label}</div>
                  <div className="mt-0.5 truncate text-xs text-neutral-muted">
                    {[role.status, role.location].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
