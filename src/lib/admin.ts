export const ADMIN_PAGE_PASSWORD = "39773977";

export function isValidAdminPassword(value: string | null | undefined) {
  return String(value ?? "").trim() === ADMIN_PAGE_PASSWORD;
}
