function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assertCandidateResumeUploadLink(
  body: string,
  profileUrl: string | null
) {
  const url = String(profileUrl ?? "").trim();
  if (!url) return;

  const markdownLink = new RegExp(
    `\\[([^\\]\\n]{1,120})\\]\\(${escapeRegExp(url)}\\)`
  );
  const match = body.match(markdownLink);
  const label = String(match?.[1] ?? "").trim();
  if (!match || !label || label === url) {
    throw new Error(
      "Resume request copy must contain the required URL in a descriptive Markdown link"
    );
  }
  if (body.replace(match[0], "").includes(url)) {
    throw new Error("Resume request copy must not expose the raw upload URL");
  }
}
