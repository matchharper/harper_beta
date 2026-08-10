export type RoleCreationConsentTarget = {
  aliases: Array<string | null | undefined>;
  id: string;
  label: string;
};

export type RoleCreationNotificationConsent = {
  missingTargetIds: string[];
  ok: boolean;
};

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[#@\s\p{P}\p{S}]/gu, "");
}

function isAffirmativeReply(value: string) {
  const compact = normalized(value);
  if (!compact || /^(아니|아니요|아뇨|no|보류|취소)/i.test(compact)) {
    return false;
  }
  return (
    /^(네|넵|넹|예|응|ㅇㅇ|좋아|좋아요|그래|그렇게|그걸로|여기로|이분으로|둘다|모두|오케이|ok|okay|yes|yep|sure)$/i.test(
      compact
    ) ||
    /^(네|넵|넹|예|응|ㅇㅇ)(좋아|좋아요|그래|그렇게|그걸로|여기로|이분으로|둘다|모두)?(해|해줘|해주세요|할게|할게요)?$/i.test(
      compact
    ) ||
    /^(그채널로|이채널로|이분으로|그분으로|둘다|모두)(좋아|좋아요|해|해줘|해주세요|할게|할게요)?$/i.test(
      compact
    ) ||
    /(연결|등록|지정|설정)(해|해줘|해주세요|할게|하면돼|하자|좋아)/.test(
      compact
    )
  );
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
 * current turn, or gives a clear affirmative answer to the assistant's
 * immediately preceding proposal that names that exact target.
 */
export function validateRoleCreationNotificationConsent(args: {
  previousAssistantMessage: string;
  targets: RoleCreationConsentTarget[];
  userMessage: string;
}): RoleCreationNotificationConsent {
  const affirmative = isAffirmativeReply(args.userMessage);
  const missingTargetIds = args.targets.flatMap((target) => {
    const selectedDirectly = mentionsTarget(args.userMessage, target);
    const acceptedNamedProposal =
      affirmative && mentionsTarget(args.previousAssistantMessage, target);
    return selectedDirectly || acceptedNamedProposal ? [] : [target.id];
  });
  return { missingTargetIds, ok: missingTargetIds.length === 0 };
}
