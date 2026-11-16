import { createHash } from "node:crypto";

/** A stable id shaped as a UUID v4 (other Role paths check that form), derived from `seed`. Server code only. */
export function derivedUuidV4(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex");
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * The Role a #2 회사 메일 makes in one workspace. One Role per mail per workspace, whoever opens it: the id is
 * derived from both, so two tabs, a retry or a colleague claiming the same mail all land on the same Role
 * instead of making a second one.
 */
export function gtmCompanyInviteRoleId(mailId: string, workspaceId: string) {
  return derivedUuidV4(`gtm-company-invite:${mailId.toLowerCase()}:${workspaceId.toLowerCase()}`);
}

/** The Role a 후보자 링크 makes in one workspace (same rule: one per link per workspace). */
export function shareLinkRoleId(linkId: string, workspaceId: string) {
  return derivedUuidV4(`share-link:${linkId.toLowerCase()}:${workspaceId.toLowerCase()}`);
}
