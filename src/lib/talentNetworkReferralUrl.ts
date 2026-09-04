function normalizeReferralToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 256);
}

export function buildTalentNetworkReferralUrl(args: {
  baseUrl: string;
  pagePath?: string | null;
  token: string;
}) {
  const baseUrl = new URL(args.baseUrl);
  const url = new URL(args.pagePath || "/", baseUrl);

  if (url.origin !== baseUrl.origin) {
    throw new Error("Referral destination must use the Harper origin.");
  }

  const token = normalizeReferralToken(args.token);
  if (!token) {
    throw new Error("Referral token is required.");
  }

  url.searchParams.set("ref", token);
  return url.toString();
}
