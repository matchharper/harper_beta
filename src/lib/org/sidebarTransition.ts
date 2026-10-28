const ORGANIZATION_SIDEBAR_PATHNAMES = new Set([
  "/org/member",
  "/org/settings",
  "/org/team",
  "/org/slots",
  "/org/billing",
  "/org/templates",
]);

export function shouldAnimateOrganizationSidebarEntry(
  previousPathname: string | null
) {
  return (
    previousPathname === null ||
    !ORGANIZATION_SIDEBAR_PATHNAMES.has(previousPathname)
  );
}
