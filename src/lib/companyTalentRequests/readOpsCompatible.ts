type ReadResult = { data: any; error: any };

/**
 * Ops-private contacts do not exist before their marker column is installed.
 * Retry only that exact missing-column error; after the migration the normal
 * query must always retain its privacy filter.
 *
 * The callback must be read-only. Never use this helper for writes.
 */
export async function readOpsCompatibleContacts<T extends ReadResult>(
  read: (hasOpsColumn: boolean) => PromiseLike<T>
): Promise<T> {
  const result = await read(true);
  if (
    result.error?.code === "42703" &&
    result.error?.message ===
      "column company_talent_requests.ops_only does not exist"
  ) {
    return await read(false);
  }
  return result;
}
