import { CAREER_LANDING_LOCAL_ID_STORAGE_KEY } from "@/lib/career/utm";

export const TALENT_NETWORK_REFERRAL_QUERY_KEY = "ref";

const TALENT_NETWORK_REFERRAL_STORAGE_KEY = "harper_talent_network_referral";
const TALENT_NETWORK_REFERRAL_VISIT_DEDUPE_PREFIX =
  "harper_talent_network_referral_visit";

export const TALENT_NETWORK_REFERRAL_SOURCE_ONBOARDING_STEP6 =
  "onboarding_step6";
export const TALENT_NETWORK_REFERRAL_SOURCE_LANDING_PAGE = "landing_page";
export const TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER = "landing_footer";
export const TALENT_NETWORK_REFERRAL_SOURCE_CAREER_LOGIN = "career_login";
export const TALENT_NETWORK_REFERRAL_SOURCE_CAREER_PROFILE_MENU =
  "career_profile_menu";

export type TalentNetworkReferralSource =
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_ONBOARDING_STEP6
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_LANDING_PAGE
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_CAREER_LOGIN
  | typeof TALENT_NETWORK_REFERRAL_SOURCE_CAREER_PROFILE_MENU;

export type TalentNetworkStoredReferral = {
  capturedAt: string;
  sharerEmail?: string;
  sharerName?: string | null;
  source?: TalentNetworkReferralSource;
  token: string;
};

export type TalentNetworkReferralStats = {
  hires: number;
  paid: number;
  signups: number;
  visits: number;
};

export type TalentNetworkReferralSummary = {
  createdAt: string | null;
  stats: TalentNetworkReferralStats;
  token: string;
  url: string;
};

export type TalentNetworkReferralListItem = {
  headline: string | null;
  hired: boolean;
  id: string;
  joinedAt: string | null;
  name: string | null;
  profilePicture: string | null;
};

export type TalentNetworkReferralListResponse = {
  items: TalentNetworkReferralListItem[];
  nextOffset: number | null;
  total: number;
};

export type TalentNetworkReferralRewardItem = {
  amount: string | null;
  hiredConfirmed: boolean;
  id: string;
  name: string | null;
  profilePicture: string | null;
  rewardDueAt: string | null;
  rewardPaid: boolean;
};

export type TalentNetworkReferralRewardListResponse = {
  items: TalentNetworkReferralRewardItem[];
  nextOffset: number | null;
  total: number;
};

export type TalentNetworkReferralClientMessages = {
  applicationListLoadFailed?: string;
  conversionRecordFailed?: string;
  linkCreateFailed?: string;
  referralListLoadFailed?: string;
  summaryLoadFailed?: string;
  visitCaptureFailed?: string;
  visitRecordFailed?: string;
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

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 256);
}

export function isTalentNetworkReferralSource(
  value: string
): value is TalentNetworkReferralSource {
  return (
    value === TALENT_NETWORK_REFERRAL_SOURCE_ONBOARDING_STEP6 ||
    value === TALENT_NETWORK_REFERRAL_SOURCE_LANDING_PAGE ||
    value === TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER ||
    value === TALENT_NETWORK_REFERRAL_SOURCE_CAREER_LOGIN ||
    value === TALENT_NETWORK_REFERRAL_SOURCE_CAREER_PROFILE_MENU
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

  const token = normalizeToken(value.token);
  const capturedAt = String(value.capturedAt ?? "").trim();
  const source = String(value.source ?? "").trim();
  const sharerEmail = String(value.sharerEmail ?? "")
    .trim()
    .toLowerCase();
  const sharerName = String(value.sharerName ?? "").trim() || null;

  if (!token || !capturedAt) return null;

  return {
    capturedAt,
    ...(sharerEmail ? { sharerEmail } : {}),
    sharerName,
    ...(isTalentNetworkReferralSource(source) ? { source } : {}),
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

export function getTalentNetworkReferralTokenFromUrlLike(
  value?: string | null
) {
  if (typeof window === "undefined" && !value) return null;

  try {
    const url = new URL(
      value ?? window.location.href,
      "https://matchharper.com"
    );
    return (
      normalizeToken(url.searchParams.get(TALENT_NETWORK_REFERRAL_QUERY_KEY)) ||
      null
    );
  } catch {
    return null;
  }
}

export function getTalentNetworkReferralTokenFromCurrentLocation() {
  if (typeof window === "undefined") return null;

  const directToken = getTalentNetworkReferralTokenFromUrlLike(
    window.location.href
  );
  if (directToken) return directToken;

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  return getTalentNetworkReferralTokenFromUrlLike(next);
}

function getVisitDedupeKey(token: string) {
  const day = new Date().toISOString().slice(0, 10);
  return `${TALENT_NETWORK_REFERRAL_VISIT_DEDUPE_PREFIX}:${token}:${day}`;
}

function createReferralVisitorLocalId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveReferralVisitorLocalId(explicitLocalId?: string | null) {
  const normalizedExplicitLocalId = String(explicitLocalId ?? "").trim();
  if (normalizedExplicitLocalId) return normalizedExplicitLocalId.slice(0, 120);
  if (typeof window === "undefined") return "";

  try {
    const storedLocalId = String(
      window.localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ?? ""
    ).trim();
    if (storedLocalId) return storedLocalId.slice(0, 120);

    const createdLocalId = createReferralVisitorLocalId();
    window.localStorage.setItem(
      CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
      createdLocalId
    );
    return createdLocalId;
  } catch {
    return createReferralVisitorLocalId();
  }
}

export async function captureTalentNetworkReferralFromCurrentLocation(args?: {
  accessToken?: string | null;
  messages?: Pick<TalentNetworkReferralClientMessages, "visitRecordFailed">;
  source?: TalentNetworkReferralSource;
}) {
  if (typeof window === "undefined") return null;

  const token = getTalentNetworkReferralTokenFromCurrentLocation();
  if (!token) return null;

  const existingStoredReferral = readTalentNetworkStoredReferral();
  const dedupeKey = getVisitDedupeKey(token);
  if (
    window.localStorage.getItem(dedupeKey) &&
    existingStoredReferral?.token === token
  ) {
    return existingStoredReferral;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (args?.accessToken) {
    headers.Authorization = `Bearer ${args.accessToken}`;
  }

  const res = await fetch("/api/talent/network/referral/visit", {
    method: "POST",
    headers,
    body: JSON.stringify({
      token,
      visitorLocalId: resolveReferralVisitorLocalId(),
    }),
  });
  const json = await readJsonResponse(res);

  if (!res.ok) {
    throw new Error(
      String(json?.error ?? "").trim() ||
        args?.messages?.visitRecordFailed ||
        "Failed to record referral visit."
    );
  }

  window.localStorage.setItem(dedupeKey, "1");

  if (json?.isSelfVisit === true) {
    return existingStoredReferral;
  }

  const stored: TalentNetworkStoredReferral = {
    capturedAt: new Date().toISOString(),
    source: args?.source,
    token,
  };
  writeTalentNetworkStoredReferral(stored);
  return stored;
}

export function getTalentNetworkReferralTokenForSignup() {
  return (
    getTalentNetworkReferralTokenFromCurrentLocation() ??
    readTalentNetworkStoredReferral()?.token ??
    null
  );
}

export async function fetchTalentNetworkReferralSummary(
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>,
  messages?: Pick<TalentNetworkReferralClientMessages, "summaryLoadFailed">
): Promise<TalentNetworkReferralSummary> {
  const res = await fetchWithAuth("/api/talent/network/referral/me");
  const json = await readJsonResponse(res);

  if (!res.ok) {
    throw new Error(
      messages?.summaryLoadFailed ||
        String(json?.error ?? "").trim() ||
        "Failed to load referral information."
    );
  }

  return {
    createdAt: String(json?.createdAt ?? "").trim() || null,
    stats: {
      hires: Number((json?.stats as Record<string, JsonValue>)?.hires ?? 0),
      paid: Number((json?.stats as Record<string, JsonValue>)?.paid ?? 0),
      signups: Number((json?.stats as Record<string, JsonValue>)?.signups ?? 0),
      visits: Number((json?.stats as Record<string, JsonValue>)?.visits ?? 0),
    },
    token: String(json?.token ?? "").trim(),
    url: String(json?.url ?? "").trim(),
  };
}

export async function fetchTalentNetworkReferralList(
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>,
  args: {
    limit: number;
    messages?: Pick<
      TalentNetworkReferralClientMessages,
      "referralListLoadFailed"
    >;
    offset: number;
  }
): Promise<TalentNetworkReferralListResponse> {
  const params = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
  });
  const res = await fetchWithAuth(
    `/api/talent/network/referral/referrals?${params.toString()}`
  );
  const json = await readJsonResponse(res);

  if (!res.ok) {
    throw new Error(
      args.messages?.referralListLoadFailed ||
        String(json?.error ?? "").trim() ||
        "Failed to load referrals."
    );
  }

  const rawItems = Array.isArray(json?.items) ? json.items : [];
  const items = rawItems
    .filter(isRecord)
    .map(
      (item): TalentNetworkReferralListItem => ({
        headline: String(item.headline ?? "").trim() || null,
        hired: item.hired === true,
        id: String(item.id ?? "").trim(),
        joinedAt: String(item.joinedAt ?? "").trim() || null,
        name: String(item.name ?? "").trim() || null,
        profilePicture: String(item.profilePicture ?? "").trim() || null,
      })
    )
    .filter((item) => item.id);

  const rawNextOffset = Number(json?.nextOffset ?? NaN);

  return {
    items,
    nextOffset: Number.isFinite(rawNextOffset) ? rawNextOffset : null,
    total: Number(json?.total ?? items.length),
  };
}

export async function fetchTalentNetworkReferralRewardList(
  fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response>,
  args: {
    limit: number;
    messages?: Pick<
      TalentNetworkReferralClientMessages,
      "applicationListLoadFailed"
    >;
    offset: number;
  }
): Promise<TalentNetworkReferralRewardListResponse> {
  const params = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
  });
  const res = await fetchWithAuth(
    `/api/talent/network/referral/applications?${params.toString()}`
  );
  const json = await readJsonResponse(res);

  if (!res.ok) {
    throw new Error(
      args.messages?.applicationListLoadFailed ||
        String(json?.error ?? "").trim() ||
        "Failed to load referral applications."
    );
  }

  const rawItems = Array.isArray(json?.items) ? json.items : [];
  const items = rawItems
    .filter(isRecord)
    .map(
      (item): TalentNetworkReferralRewardItem => ({
        amount: String(item.amount ?? "").trim() || null,
        hiredConfirmed: item.hiredConfirmed === true,
        id: String(item.id ?? "").trim(),
        name: String(item.name ?? "").trim() || null,
        profilePicture: String(item.profilePicture ?? "").trim() || null,
        rewardDueAt: String(item.rewardDueAt ?? "").trim() || null,
        rewardPaid: item.rewardPaid === true,
      })
    )
    .filter((item) => item.id);
  const rawNextOffset = Number(json?.nextOffset ?? NaN);

  return {
    items,
    nextOffset: Number.isFinite(rawNextOffset) ? rawNextOffset : null,
    total: Number(json?.total ?? items.length),
  };
}

export async function createTalentNetworkReferralLink(args: {
  email?: string;
  messages?: Pick<TalentNetworkReferralClientMessages, "linkCreateFailed">;
  name?: string | null;
  pagePath?: string | null;
  sharerLocalId?: string | null;
  source?: TalentNetworkReferralSource;
}) {
  void args;
  const res = await fetch("/api/talent/network/referral/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  const json = await readJsonResponse(res);
  const url = String(json?.url ?? "").trim();
  const token = String(json?.token ?? "").trim();

  if (!res.ok || !url || !token) {
    throw new Error(
      String(json?.error ?? "").trim() ||
        args.messages?.linkCreateFailed ||
        "Failed to create share link."
    );
  }

  return { token, url };
}

export async function captureTalentNetworkReferralVisit(args: {
  messages?: Pick<TalentNetworkReferralClientMessages, "visitCaptureFailed">;
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
      token: args.token,
      visitorLocalId: resolveReferralVisitorLocalId(args.visitorLocalId),
    }),
  });

  const json = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      String(json?.error ?? "").trim() ||
        args.messages?.visitCaptureFailed ||
        "Failed to record share visit."
    );
  }

  return {
    isSelfVisit: json?.isSelfVisit === true,
    sharerEmail: "",
    sharerName: null,
    source:
      TALENT_NETWORK_REFERRAL_SOURCE_LANDING_FOOTER as TalentNetworkReferralSource,
    token: args.token,
  };
}

export async function markTalentNetworkReferralConverted(args: {
  messages?: Pick<
    TalentNetworkReferralClientMessages,
    "conversionRecordFailed"
  >;
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
      referredUserId: args.referredLocalId,
    }),
  });

  const json = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(
      String(json?.error ?? "").trim() ||
        args.messages?.conversionRecordFailed ||
        "Failed to record share conversion."
    );
  }
}
