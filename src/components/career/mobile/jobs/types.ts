export type JobsDisplayTab =
  | "new"
  | "saved"
  | "applied"
  | "connected"
  | "closed"
  | "hidden"
  | "archived";

export type JobsStatusTab = Exclude<JobsDisplayTab, "new">;

export type JobsStatusCounts = Record<JobsStatusTab, number>;
