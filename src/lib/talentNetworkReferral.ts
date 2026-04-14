export const TALENT_NETWORK_REFERRAL_QUERY_KEY = "ref";

const TALENT_NETWORK_REFERRAL_STORAGE_KEY =
  "harper_talent_network_referral";

export const TALENT_NETWORK_REFERRAL_SOURCE_ONBOARDING_STEP6 =
  "onboarding_step6";
export const TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER = "landing_footer";

export type TalentNetworkReferralSource =
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_ONBOARDING_STEP6
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER;

export type TalentNetworkStoredReferral = {
  capturedAt: string;
  sharerEmail: string;
  sharerName: string | null;
  source: TalentNetworkReferralSource;
  token: string;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTalentNetworkReferralSource(
  value: string
): value is TalentNetworkReferralSource {
  return (
    value === TALENT_NETWORK_REFERRAL_SOURCE_ONBOARDING_STEP6 ||
    value === TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER
  );
}

export async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function normalizeStoredReferral(
  value: unknown
): TalentNetworkStoredReferral | null {
  if (!isRecord(value)) return null;

  const token = String(value.token ?? "").trim();
  const sharerEmail = String(value.sharerEmail ?? "")
    .trim()
    .toLowerCase();
  const sharerName = String(value.sharerName ?? "").trim() || null;
  const capturedAt = String(value.capturedAt ?? "").trim();
  const source = String(value.source ?? "").trim();

  if (!token || !sharerEmail || !capturedAt) return null;
  if (!isTalentNetworkReferralSource(source)) return null;

  return {
    capturedAt,
    sharerEmail,
    sharerName,
    source,
    token,
  };
}

export function readTalentNetworkStoredReferral() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(TALENT_NETWORK_REFERRAL_STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeStoredReferral(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeTalentNetworkStoredReferral(
  value: TalentNetworkStoredReferral
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TALENT_NETWORK_REFERRAL_STORAGE_KEY,
    JSON.stringify(value)
  );
}

export function clearTalentNetworkStoredReferral() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TALENT_NETWORK_REFERRAL_STORAGE_KEY);
}

async function readJsonResponse(res: Response) {
  try {
    return (await res.json()) as Record<string, JsonValue>;
  } catch {
    return null;
  }
}

export async function createTalentNetworkReferralLink(args: {
  email: string;
  name?: string | null;
  pagePath?: string | null;
  sharerLocalId?: string | null;
  source: TalentNetworkReferralSource;
}) {
  const res = await fetch("/api/talent/network/referral/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: args.email,
      name: args.name,
      pagePath: args.pagePath,
      sharerLocalId: args.sharerLocalId,
      source: args.source,
    }),
  });

  const json = await readJsonResponse(res);
  const url = String(json?.url ?? "").trim();
  const token = String(json?.token ?? "").trim();

  if (!res.ok || !url || !token) {
    throw new Error(
      String(json?.error ?? "").trim() || "공유 링크 생성에 실패했습니다."
    );
  }

  return { token, url };
}

export async function captureTalentNetworkReferralVisit(args: {
  pagePath?: string | null;
  token: string;
  visitorLocalId?: string | null;
}) {
  const res = await fetch("/api/talent/network/referral/visit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      pagePath: args.pagePath,
      token: args.token,
      visitorLocalId: args.visitorLocalId,
    }),
  });

  const json = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      String(json?.error ?? "").trim() || "공유 유입 기록에 실패했습니다."
    );
  }

  return {
    isSelfVisit: json?.isSelfVisit === true,
    sharerEmail: String(json?.sharerEmail ?? "")
      .trim()
      .toLowerCase(),
    sharerName: String(json?.sharerName ?? "").trim() || null,
    source: String(json?.source ?? "").trim(),
  };
}

export async function markTalentNetworkReferralConverted(args: {
  referredEmail?: string | null;
  referredLocalId?: string | null;
  referredName?: string | null;
  selectedRole?: string | null;
  token: string;
}) {
  const res = await fetch("/api/talent/network/referral/convert", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      referredEmail: args.referredEmail,
      referredLocalId: args.referredLocalId,
      referredName: args.referredName,
      selectedRole: args.selectedRole,
      token: args.token,
    }),
  });

  const json = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      String(json?.error ?? "").trim() || "공유 전환 기록에 실패했습니다."
    );
  }
}
