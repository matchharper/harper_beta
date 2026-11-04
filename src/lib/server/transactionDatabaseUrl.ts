/**
 * Web SQL clients use transaction-local settings/locks and no session state.
 * A shared Supabase session endpoint pins one backend per serverless client,
 * including idle clients. Use its transaction endpoint to release that backend
 * between transactions. Direct/custom endpoints keep their configured behavior.
 */
export function transactionDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (
    (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
    url.hostname.endsWith(".pooler.supabase.com") &&
    (!url.port || url.port === "5432")
  ) {
    url.port = "6543";
    return url.toString();
  }
  return databaseUrl;
}
