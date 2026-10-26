export type RoleMatchingActivity = {
  trigger: "scheduled" | "role_activated" | "requested";
  phase: "queued" | "searching" | "reviewing" | "preparing" | "delivering";
};

export type OrgMatchingSearchStatusResponse = {
  /** Existing manual-search button state; automatic work does not change it. */
  active: boolean;
  activity: RoleMatchingActivity | null;
  ok: true;
};
