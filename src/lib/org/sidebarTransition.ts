const ORGANIZATION_SIDEBAR_PATHNAMES = new Set([
  "/org/member",
  "/org/settings",
  "/org/team",
]);

export function shouldAnimateOrganizationSidebarEntry(
  previousPathname: string | null
) {
  return (
    previousPathname === null ||
    !ORGANIZATION_SIDEBAR_PATHNAMES.has(previousPathname)
  );
}
