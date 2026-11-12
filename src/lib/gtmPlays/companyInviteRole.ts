import { createHash } from "node:crypto";

/**
 * The Role a #2 회사 메일 makes in one workspace. One Role per mail per workspace, whoever opens it: the id is
 * derived from both, so two tabs, a retry or a colleague claiming the same mail all land on the same Role
 * instead of making a second one. Shaped as a UUID v4 (other Role paths check that form). Server code only.
 */
export function gtmCompanyInviteRoleId(mailId: string, workspaceId: string) {
  const hash = createHash("sha256")
    .update(`gtm-company-invite:${mailId.toLowerCase()}:${workspaceId.toLowerCase()}`)
    .digest("hex");
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
