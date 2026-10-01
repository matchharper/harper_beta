export const OFFICIAL_JOBS_LAYOUT_EXPERIMENT = "official_jobs_layout_v1";
export const OFFICIAL_JOBS_LAYOUT_COOKIE = "harper_official_jobs_layout_v1";
export const OFFICIAL_JOBS_LAYOUT_ABTEST_A = "official_jobs_layout_v1_a";
export const OFFICIAL_JOBS_LAYOUT_ABTEST_B = "official_jobs_layout_v1_b";

export type OfficialJobsLayoutVariant = "A" | "B";

export function parseOfficialJobsLayoutVariant(value: unknown) {
  return value === "A" || value === "B" ? value : null;
}

export function readOfficialJobsLayoutVariant(cookieHeader: string) {
  const cookie = cookieHeader
    .split(";")
    .find((part) => part.trim().startsWith(`${OFFICIAL_JOBS_LAYOUT_COOKIE}=`));
  return parseOfficialJobsLayoutVariant(cookie?.trim().split("=")[1]);
}

export function getOfficialJobsLayoutAbtestType(
  variant: OfficialJobsLayoutVariant | null
) {
  if (variant === "A") return OFFICIAL_JOBS_LAYOUT_ABTEST_A;
  if (variant === "B") return OFFICIAL_JOBS_LAYOUT_ABTEST_B;
  return "official_jobs_landing_v1";
}

export function getCurrentOfficialJobsAbtestType() {
  return getOfficialJobsLayoutAbtestType(
    typeof document === "undefined"
      ? null
      : readOfficialJobsLayoutVariant(document.cookie)
  );
}
