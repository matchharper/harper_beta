import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useAuthStore } from "@/store/useAuthStore";
import {
  canPreviewOrgBilling,
  PREVIEW_CARDS,
  PREVIEW_SUBSCRIPTIONS,
  type OrgBillingPreview,
} from "@/lib/org/billing/preview";
import { MAX_SLOT_PURCHASE_QUANTITY } from "@/lib/org/billing/types";

function isPreview(value: unknown): value is OrgBillingPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Partial<OrgBillingPreview>;
  return (
    typeof preview.userId === "string" &&
    typeof preview.slotCount === "number" &&
    Number.isInteger(preview.slotCount) &&
    preview.slotCount >= 0 &&
    preview.slotCount <= MAX_SLOT_PURCHASE_QUANTITY &&
    (preview.interval === "month" || preview.interval === "year") &&
    typeof preview.startedAt === "string" &&
    Number.isFinite(Date.parse(preview.startedAt)) &&
    (preview.card === undefined ||
      Object.hasOwn(PREVIEW_CARDS, preview.card)) &&
    (preview.subscription === undefined ||
      Object.hasOwn(PREVIEW_SUBSCRIPTIONS, preview.subscription)) &&
    (preview.credits === undefined ||
      ["full", "low", "empty"].includes(preview.credits)) &&
    (preview.history === undefined ||
      ["empty", "sample"].includes(preview.history)) &&
    (preview.checkoutOutcome === undefined ||
      ["success", "declined", "authentication"].includes(
        preview.checkoutOutcome
      )) &&
    (preview.slotAssignments === undefined ||
      (preview.slotAssignments !== null &&
        typeof preview.slotAssignments === "object" &&
        Object.entries(preview.slotAssignments).every(
          ([id, role]) =>
            /^billing-preview-(?:\d+|free)$/.test(id) &&
            (role === null ||
              (typeof role === "object" &&
                typeof role.roleId === "string" &&
                typeof role.roleName === "string"))
        ))) &&
    (preview.slotRenewals === undefined ||
      (preview.slotRenewals !== null &&
        typeof preview.slotRenewals === "object" &&
        Object.entries(preview.slotRenewals).every(
          ([id, state]) =>
            /^billing-preview-\d+$/.test(id) &&
            ["active", "ending"].includes(state)
        )))
  );
}

export const useOrgBillingPreviewStore = create<{
  preview: OrgBillingPreview | null;
  setPreview: (preview: OrgBillingPreview | null) => void;
}>()(
  persist(
    (set) => ({
      preview: null,
      setPreview: (preview) =>
        set({ preview: isPreview(preview) ? preview : null }),
    }),
    {
      name: "harper-org-billing-preview",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ preview: state.preview }),
      merge: (persisted, current) => {
        const preview = (persisted as { preview?: unknown } | null)?.preview;
        return { ...current, preview: isPreview(preview) ? preview : null };
      },
    }
  )
);

export function getOrgBillingPreview(workspaceId: string) {
  const user = useAuthStore.getState().user;
  const preview = useOrgBillingPreviewStore.getState().preview;
  return canPreviewOrgBilling(workspaceId, user?.email) &&
    user?.id === preview?.userId
    ? preview
    : null;
}

export function useOrgBillingPreview(workspaceId: string) {
  const user = useAuthStore((state) => state.user);
  const stored = useOrgBillingPreviewStore((state) => state.preview);
  const setPreview = useOrgBillingPreviewStore((state) => state.setPreview);
  const available = canPreviewOrgBilling(workspaceId, user?.email);
  useEffect(() => {
    if (available && !useOrgBillingPreviewStore.persist.hasHydrated()) {
      void useOrgBillingPreviewStore.persist.rehydrate();
    }
  }, [available]);
  return {
    available,
    preview: available && stored?.userId === user?.id ? stored : null,
    setPreview,
    userId: user?.id,
  };
}
