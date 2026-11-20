/**
 * Company research can have its own workspace with no team or roles. The
 * pre-migration schema has no such rows and can use its original lookup.
 */
export async function readOperatingWorkspaces<T extends { error: { code?: string; message?: string } | null }>(
  read: (excludeResearchWorkspace: boolean) => PromiseLike<T>
): Promise<T> {
  const result = await read(true);
  const error = result.error;
  if ((error?.code === "42703" || error?.code === "PGRST204") && error.message?.includes("is_public_data_home")) {
    return read(false);
  }
  return result;
}
