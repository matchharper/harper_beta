import { TOOL_MODEL_DIAGNOSTIC } from "@/lib/llm/toolError";

export class RoleSqlExecutionError extends Error {
  readonly sql: string;
  readonly timedOut: boolean;
  readonly [TOOL_MODEL_DIAGNOSTIC]: Record<string, unknown>;

  constructor(args: { message: string; sql: string; code?: string }) {
    super(args.message);
    this.name = "RoleSqlExecutionError";
    this.sql = args.sql;
    this.timedOut = /statement timeout/i.test(args.message);
    this[TOOL_MODEL_DIAGNOSTIC] = {
      name: this.name,
      ...(args.code ? { code: args.code } : {}),
      message: this.message,
      recovery: this.timedOut
        ? "The current public-job search exceeded its time limit before producing recommendations. No new recommendations were saved by this search. Existing recommendations are unchanged. This is not an empty search result and does not establish that no suitable jobs exist. Continue from verified existing results; retry a narrower search when useful without silently changing the user's requirements."
        : "The public-job query failed before producing recommendations. No new recommendations were saved by this search. Existing recommendations are unchanged. Do not interpret this as no matching jobs or keep repeating the same failing query. Use other verified results or explain that this search could not be completed.",
    };
  }
}
