export function localizeOrgProfilePeriod(
  period: string | null,
  currentLabel: string
) {
  return period?.replace(/ - 현재$/, ` - ${currentLabel}`) ?? null;
}
