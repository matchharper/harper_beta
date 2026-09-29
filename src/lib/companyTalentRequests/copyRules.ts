/** An upload link is optional; if present, its signed destination must be exact. */
export function assertCandidateContactUploadLinks(
  body: string,
  profileUrl: string | null
) {
  const expected = profileUrl ? new URL(profileUrl).href : null;
  for (const value of body.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []) {
    const url = new URL(value);
    if (url.searchParams.has("resumeRequest") && url.href !== expected) {
      throw new Error("Candidate contact contains an unverified upload URL");
    }
  }
}
