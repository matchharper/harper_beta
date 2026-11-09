// Exact live Korea roles; never resolve similarly named overseas or external jobs.
export const WONDERFUL_KOREA_FDE_ROLE_ID =
  "e1657263-3369-48c9-8e1b-812834e79037";
export const WONDERFUL_KOREA_MARKETING_MANAGER_ROLE_ID =
  "af93b793-cc19-4f7c-a6d4-9df8e8dd9f24";

export const WONDERFUL_ROLE_RESET_TARGETS = [
  { key: "korea-fde", roleId: WONDERFUL_KOREA_FDE_ROLE_ID, label: "Wonderful Korea FDE" },
  { key: "korea-marketing-manager", roleId: WONDERFUL_KOREA_MARKETING_MANAGER_ROLE_ID, label: "Wonderful Marketing Manager" },
] as const;

export type WonderfulRoleResetTarget = typeof WONDERFUL_ROLE_RESET_TARGETS[number]["key"];

export function getWonderfulRoleResetTarget(value: unknown) {
  return WONDERFUL_ROLE_RESET_TARGETS.find((target) => target.key === value);
}
