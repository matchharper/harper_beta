import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useToastStore } from "@/store/useToastStore";
import { getOrgBillingPreview } from "@/store/useOrgBillingPreviewStore";
import { orgEntitlementsOptions, orgBillingKey } from "./useOrgBilling";
import { isOrgRoleCountedAsActive } from "@/lib/org/roleStatus";
import type { OrgRole } from "@/lib/org/server";
import type { BillingEntitlements } from "@/lib/org/billing/types";

/** Observe committed Role transitions, never the start of hiring setup. */
export function useRoleActivationToast(workspaceId: string, roles: OrgRole[]) {
  const { c } = useOrgLocale();
  const client = useQueryClient();
  const addToast = useToastStore((state) => state.add);
  const previous = useRef<{
    workspaceId: string;
    active: Map<string, boolean>;
  } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = {
      workspaceId,
      active: new Map(
        roles.map((role) => [
          role.roleId,
          isOrgRoleCountedAsActive(role.status),
        ])
      ),
    };
    // Opening a workspace or reloading an already active Role is not activation.
    if (
      !before ||
      before.workspaceId !== workspaceId ||
      getOrgBillingPreview(workspaceId)
    )
      return;
    const started = roles.filter(
      (role) =>
        before.active.get(role.roleId) === false &&
        isOrgRoleCountedAsActive(role.status)
    );
    if (!started.length) return;
    // The DB activation trigger has already assigned an available slot in the
    // same transaction. Read its result; never race it with a browser assignment.
    const notify = (slots: BillingEntitlements["creditSlots"] = []) => {
      // A workspace switch or a later pause must not show a stale start notice.
      if (previous.current?.workspaceId !== workspaceId) return;
      for (const role of started) {
        if (!previous.current.active.get(role.roleId)) continue;
        const slot = slots.find(
          (item) => item.slotId && item.roleId === role.roleId
        );
        addToast({
          message: slot
            ? c(
                "{role} 채용을 시작하고 빈 슬롯을 자동으로 배정했어요.",
                "Hiring started for {role}, and an available slot was assigned automatically.",
                { role: role.name }
              )
            : c("{role} 채용을 시작했어요.", "Hiring started for {role}.", {
                role: role.name,
              }),
          variant: "dark",
          duration: 6000,
        });
      }
    };
    void client.invalidateQueries({ queryKey: orgBillingKey(workspaceId) });
    void client
      .fetchQuery({ ...orgEntitlementsOptions(workspaceId), staleTime: 0 })
      .then((entitlements) => notify(entitlements.creditSlots))
      .catch((error) => {
        // Toast/slot lookup is background-only and never changes activation success.
        console.warn("[org/role-slot-notice]", error);
        notify();
      });
  }, [workspaceId, roles, client, c, addToast]);
}
