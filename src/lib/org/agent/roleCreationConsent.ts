export type RoleCreationConsentTarget = {
  aliases: Array<string | null | undefined>;
  id: string;
  kind: "assignee" | "channel";
  label: string;
};

export type RoleCreationNotificationConsent = {
  missingTargetIds: string[];
  ok: boolean;
};

export function isUnambiguousFinalRoleNotificationDefault(args: {
  availableChannelIds: string[];
  currentUserId: string;
  memberUserIds: string[];
  roleStatus: string | null;
  selectedAssigneeUserId: string;
  selectedChannelIds: string[];
  unresolvedFields: string[];
}) {
  return (
    args.roleStatus === "draft" &&
    args.availableChannelIds.length === 1 &&
    args.selectedChannelIds.length === 1 &&
    args.selectedChannelIds[0] === args.availableChannelIds[0] &&
    args.selectedAssigneeUserId === args.currentUserId &&
    args.memberUserIds.includes(args.currentUserId) &&
    args.unresolvedFields.every(
      (field) => field === "connected_slack" || field === "assignee"
    )
  );
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[#@\s\p{P}\p{S}]/gu, "");
}

function mentionsTarget(value: string, target: RoleCreationConsentTarget) {
  const haystack = normalized(value);
  if (!haystack) return false;
  return [target.label, target.id, ...target.aliases].some((alias) => {
    const needle = normalized(alias);
    return needle.length >= 2 && haystack.includes(needle);
  });
}

/**
 * A notification target is consented only when the user names it in the
 * current turn, or approves the assistant's immediately preceding proposal
 * that names that exact target. Approval is judged by meaning, not wording.
 */
export async function validateRoleCreationNotificationConsent(args: {
  approvesProposal: (input: {
    previousAssistantMessage: string;
    targets: RoleCreationConsentTarget[];
    userMessage: string;
  }) => Promise<boolean>;
  previousAssistantMessage: string;
  targets: RoleCreationConsentTarget[];
  userMessage: string;
}): Promise<RoleCreationNotificationConsent> {
  const unnamedTargets = args.targets.filter(
    (target) => !mentionsTarget(args.userMessage, target)
  );
  const approved =
    unnamedTargets.length > 0 &&
    unnamedTargets.every((target) =>
      mentionsTarget(args.previousAssistantMessage, target)
    ) &&
    (await args.approvesProposal({
      previousAssistantMessage: args.previousAssistantMessage,
      targets: unnamedTargets,
      userMessage: args.userMessage,
    }));
  const missingTargetIds = approved
    ? []
    : unnamedTargets.map((target) => target.id);
  return { missingTargetIds, ok: missingTargetIds.length === 0 };
}
