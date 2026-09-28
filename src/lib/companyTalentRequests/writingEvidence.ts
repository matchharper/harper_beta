/** Facts already read by the executor, projected without private profile data. */
export function candidateContactWritingEvidence(args: {
  stageLabel: string;
  proposalAwaitingReply: boolean;
}) {
  return [
    `Verified current relationship: ${args.stageLabel}.`,
    ...(args.proposalAwaitingReply ? ["The company sent a proposal; the candidate has not expressed interest or accepted it."] : []),
  ].join("\n");
}
