import { OrgHttpError } from "./httpError";

/**
 * A registered role-start Role's Brief text and criteria are copies of its role
 * start Brief; the database refuses any other write to them
 * (company_role_brief_via_role_start, guard_company_role_brief_copy_v1).
 */
export const ROLE_START_BRIEF_ONLY_MESSAGE = "이 역할의 기준은 확인할 기준 탭의 ‘찾는 사람’에서 고쳐 주세요.";

export const ROLE_START_BRIEF_ONLY_TOOL_MESSAGE =
  "This Role was started with role start: its brief text and criteria change only through the role start brief. " +
  "Use update_role_criteria, or a role_request change in update_data, which go through the Brief.";

export function isRoleStartBriefCopyError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return message.includes("company_role_brief_via_role_start");
}

/** The database refusal as the same 409 the role screen gives; other errors unchanged. */
export function roleStartBriefCopyHttpError(error: unknown) {
  return isRoleStartBriefCopyError(error) ? new OrgHttpError(409, ROLE_START_BRIEF_ONLY_MESSAGE) : error;
}
