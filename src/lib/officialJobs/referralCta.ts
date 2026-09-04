export function resolveOfficialJobsReferralCtaMode(args: {
  authLoading: boolean;
  hasDirectReferralToken: boolean;
  hasUser: boolean;
}) {
  if (args.hasDirectReferralToken) return "hidden" as const;
  if (args.authLoading) return "loading" as const;
  return args.hasUser ? ("copy" as const) : ("link" as const);
}

export function resolveOfficialJobsReferralCtaLabel(isCopied: boolean) {
  return isCopied ? "Copied" : "Refer & Earn";
}
