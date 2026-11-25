import "server-only";

import { OFFICIAL_JOBS_ONESCREEN_ROLLOUT } from "@/lib/officialJobs/oneScreen";
import { readOnly } from "./officialJobsConversion.server";
import {
  buildJobsOneScreenExperiment,
  type JobsOneScreenBrowserRow,
  type JobsOneScreenPendingAccount,
} from "./jobsOneScreenExperiment";
import {
  JOBS_ONESCREEN_AB_SQL,
  JOBS_ONESCREEN_COMPANY_SQL,
  JOBS_ONESCREEN_PENDING_ACCOUNTS_SQL,
} from "./jobsOneScreenExperiment.sql";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * auth.users rows for the signed-in ids that have no talent row yet. A failure (no access to auth.users) only drops
 * those few one-screen sign-ups from the count; the card still loads.
 */
async function readPendingAccounts(rows: JobsOneScreenBrowserRow[]) {
  const ids = [
    ...new Set(rows.flatMap((row) => row.pending_user_ids ?? []).filter((id) => UUID_PATTERN.test(id))),
  ];
  const accounts = new Map<string, JobsOneScreenPendingAccount>();
  if (!ids.length) return accounts;
  try {
    const found = await readOnly<{ user_id: string; created_at: string | Date; email: string | null }>(
      JOBS_ONESCREEN_PENDING_ACCOUNTS_SQL,
      [`{${ids.join(",")}}`]
    );
    for (const account of found) {
      accounts.set(account.user_id, { createdAt: account.created_at, email: account.email });
    }
  } catch (error) {
    console.warn(
      "[ops-ab-jobs-onescreen] pending sign-ups unread:",
      error instanceof Error ? error.message : error
    );
  }
  return accounts;
}

/** The /ops A/B card of the job page's one screen, for browsers whose first view is at or after `startIso`. */
export async function fetchJobsOneScreenExperiment(args: {
  startIso: string;
  excludeEmail: (email: string) => boolean;
}) {
  const workspaceIds = OFFICIAL_JOBS_ONESCREEN_ROLLOUT.abWorkspaceIds.join(",");
  const [rows, company] = await Promise.all([
    readOnly<JobsOneScreenBrowserRow>(JOBS_ONESCREEN_AB_SQL, [workspaceIds, args.startIso]),
    readOnly<{ company_name: string | null }>(JOBS_ONESCREEN_COMPANY_SQL, [workspaceIds]),
  ]);
  return buildJobsOneScreenExperiment({
    rows,
    companyName: company[0]?.company_name ?? null,
    excludeEmail: args.excludeEmail,
    pendingAccounts: await readPendingAccounts(rows),
  });
}
