export const OPS_MATCHING_NO_TAG_FILTER_VALUE = "__matching_no_tag__";
export const OPS_MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_VALUE =
  "__matching_exclude_not_interested__";

export function isOpsMatchingNoTagFilter(value: string | null | undefined) {
  return String(value ?? "").trim() === OPS_MATCHING_NO_TAG_FILTER_VALUE;
}

export function isOpsMatchingExcludeNotInterestedFilter(
  value: string | null | undefined
) {
  return (
    String(value ?? "").trim() ===
    OPS_MATCHING_EXCLUDE_NOT_INTERESTED_FILTER_VALUE
  );
}
