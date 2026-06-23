export type JobsDisplayTab =
  | "new"
  | "saved"
  | "active"
  | "closed"
  | "hidden"
  | "archived";

export type JobsStatusTab = Exclude<JobsDisplayTab, "new">;

export type JobsStatusCounts = Record<JobsStatusTab, number>;
