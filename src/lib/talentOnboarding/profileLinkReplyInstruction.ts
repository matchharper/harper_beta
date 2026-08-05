export function buildProfileLinkReplyInstruction(args: {
  addedCount: number;
  deletedCount: number;
}) {
  const hasAddedLinks = args.addedCount > 0;
  const hasDeletedLinks = args.deletedCount > 0;
  if (!hasAddedLinks && !hasDeletedLinks) return "";

  return [
    hasAddedLinks
      ? "For each added professional link, confirm that it was registered, but do not stop at a terse registration acknowledgement. Explain in the user's language that Harper can use the saved link and relevant information available from it, when useful, to understand and represent the user and improve future opportunity matching. Also explain that, during a Harper internal company connection, Harper may include or use the link and relevant profile-derived information when it helps the company understand the user's fit. Do not promise that every link will always be analyzed, shared, or used for every match. Frame this as Harper using the information carefully for the user's benefit."
      : "",
    hasDeletedLinks
      ? "For each deleted professional link, confirm that it was removed and explain that Harper will no longer use it as a saved source for future matching or future company-connection materials unless the user adds it again. Do not claim that deletion retracts information that was previously shared with the user's consent."
      : "",
    "Keep this explanation concise but substantive, normally two to four sentences, and mention the actual link naturally when helpful.",
  ]
    .filter(Boolean)
    .join(" ");
}
