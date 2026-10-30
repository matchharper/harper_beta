import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// After the team changes a Role's criteria, Harper judges inbox candidates
// again in the background. This keeps, per Role, which candidates were being
// judged again and which ones the team chose to review afterwards.
type RoleRecheck = {
  /** A save that started judging again, before the board shows it. */
  expectedAt?: number;
  /** recommendationId → criteria being judged again. */
  watching?: Record<string, string[]>;
  /** Candidates whose changed criteria came back as not a fit, awaiting the team's choice. */
  found?: Record<string, string[]>;
  /** Candidates the team chose to review (keep or exclude). */
  queue?: Record<string, string[]>;
};

type OrgCriteriaRecheckState = {
  roles: Record<string, RoleRecheck>;
  update: (
    roleId: string,
    patch: (current: RoleRecheck) => RoleRecheck
  ) => void;
};

export const useOrgCriteriaRecheckStore = create<OrgCriteriaRecheckState>()(
  persist(
    (set) => ({
      roles: {},
      update: (roleId, patch) =>
        set((state) => ({
          roles: { ...state.roles, [roleId]: patch(state.roles[roleId] ?? {}) },
        })),
    }),
    {
      name: "org-criteria-recheck",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ roles: state.roles }),
    }
  )
);

/** Called when a criteria save reports candidates being judged again. */
export function expectOrgCriteriaRecheck(roleId: string) {
  useOrgCriteriaRecheckStore
    .getState()
    .update(roleId, (current) => ({ ...current, expectedAt: Date.now() }));
}
