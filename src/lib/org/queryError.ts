/** Transport failures may keep a confirmed snapshot; access failures may not. */
export function isOrgQueryAccessError(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return status === 401 || status === 403 || status === 404;
}

export function isOrgQueryBlockingError(error: unknown, data: unknown) {
  return Boolean(error) && (data === undefined || isOrgQueryAccessError(error));
}
