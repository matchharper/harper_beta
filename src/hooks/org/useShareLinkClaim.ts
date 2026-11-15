import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { buildOrgHref } from "@/lib/org/routes";
import {
  SHARE_LINK_ORG_PARAM,
  SHARE_LINK_STORAGE_KEY,
  isShareLinkCta,
  isShareLinkToken,
  type ShareLinkClaim,
  type ShareLinkCta,
  type ShareLinkTeaser,
} from "@/lib/shareLinks/shared";
import { queryKeys } from "@/lib/queryKeys";

/**
 * 후보 공유 링크 → /c/<token> → sign-in → /org?share=<token>&cta=<button>. The browser keeps the token through
 * sign-in and workspace creation; once the person is in a workspace they can add Roles to, the server puts the
 * candidate on the posting's Role (claim) and the Role opens with the candidate.
 */

// A link opened and left for a week no longer pulls the next visit into a Role.
const PENDING_TTL_MS = 7 * 86_400_000;
/** The question the button asked, for the Role chat's input (read once by the Role screen). */
export const SHARE_LINK_ASK_KEY = "harper:share-link-ask";

/** `text`: a question typed on /c instead of a button. */
type Pending = { token: string; cta: ShareLinkCta | null; text?: string; savedAt: number };
export type ShareLinkAsk = { roleId: string; talentId: string; name: string; question: string };

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHARE_LINK_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readPending(): Pending | null {
  try {
    const raw = window.localStorage.getItem(SHARE_LINK_STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<Pending>) : null;
    if (!value || !isShareLinkToken(value.token)) return null;
    if (typeof value.savedAt !== "number" || Date.now() - value.savedAt > PENDING_TTL_MS) return null;
    return {
      token: value.token,
      cta: isShareLinkCta(value.cta) ? value.cta : null,
      text: typeof value.text === "string" ? value.text.slice(0, 1_000) : undefined,
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

/** Kept as a string so the store's snapshot compares by value. */
function pendingSnapshot() {
  const pending = readPending();
  return pending ? `${pending.token}:${pending.cta ?? ""}` : "";
}

/** /c/<token> keeps the link before sending the person to sign in (and /org?share= does the same). */
export function rememberShareLink(token: string, cta: ShareLinkCta | null, text?: string) {
  try {
    const value: Pending = { token, cta, text: text?.trim() || undefined, savedAt: Date.now() };
    window.localStorage.setItem(SHARE_LINK_STORAGE_KEY, JSON.stringify(value));
    notify();
  } catch {
    // Storage blocked: the ?share= value still works while it stays in the address.
  }
}

function forgetPending() {
  try {
    window.localStorage.removeItem(SHARE_LINK_STORAGE_KEY);
  } catch {
    // Nothing kept.
  }
  notify();
}

export function usePendingShareLink(): { token: string; cta: ShareLinkCta | null } | null {
  const snapshot = useSyncExternalStore(subscribe, pendingSnapshot, () => "");
  if (!snapshot) return null;
  const [token, cta] = snapshot.split(":");
  return { token, cta: isShareLinkCta(cta) ? cta : null };
}

/** /org?share=<token>&cta=<button>: keep it before sign-in and before the entry redirects drop the query. */
export function useCaptureShareLink() {
  const router = useRouter();
  const token = router.isReady ? router.query[SHARE_LINK_ORG_PARAM] : undefined;
  const cta = router.isReady ? router.query.cta : undefined;
  useEffect(() => {
    if (!isShareLinkToken(token)) return;
    const current = readPending();
    const nextCta = isShareLinkCta(cta) ? cta : null;
    // Same link: keep what /c stored (a typed question is not in the address).
    if (current?.token === token && (current.cta === nextCta || !nextCta)) return;
    rememberShareLink(token, nextCta);
  }, [cta, token]);
  return isShareLinkToken(token) ? token : null;
}

/** Before sign-in: whose profile the link opened (null when unknown). */
export function useShareLinkTeaser(token: string | null) {
  return useQuery({
    queryKey: ["org", "share-link-teaser", token ?? ""],
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/org/share-link?t=${encodeURIComponent(token ?? "")}`);
      const payload = (await response.json().catch(() => ({}))) as { teaser?: ShareLinkTeaser | null };
      return payload.teaser ?? null;
    },
  }).data ?? null;
}

export type ShareLinkClaimPhase = "claiming" | "error";

/**
 * Claims the waiting link in the open workspace, then opens the Role with the candidate. Staff accounts and
 * members who cannot add Roles drop the link and continue as usual. `active` while the claim screen shows.
 */
export function useShareLinkClaim(args: {
  workspaceId: string | null;
  authority: string | null;
  /** Harper staff, or a workspace under review (no Roles can be added): the link is dropped. */
  blocked: boolean;
}) {
  const pending = usePendingShareLink();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ShareLinkClaimPhase>("claiming");
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);
  const token = pending?.token ?? null;
  const cta = pending?.cta ?? null;
  const eligible = Boolean(token && args.workspaceId && !args.blocked &&
    (args.authority === "owner" || args.authority === "admin"));

  useEffect(() => {
    if (!token || !args.workspaceId) return;
    if (args.blocked) {
      forgetPending();
      return;
    }
    if (!args.authority) return;
    if (!eligible) {
      forgetPending();
      return;
    }
    const key = `${token}:${args.workspaceId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const workspaceId = args.workspaceId;
    setPhase("claiming");
    void (async () => {
      try {
        const result = await fetchWithInternalAuth<ShareLinkClaim>("/api/org/share-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, workspaceId, cta }),
        });
        if (result.status === "claimed") {
          const question = readPending()?.text || result.question;
          if (question) {
            try {
              const ask: ShareLinkAsk = { roleId: result.roleId, talentId: result.talentId, name: result.name, question };
              window.sessionStorage.setItem(SHARE_LINK_ASK_KEY, JSON.stringify(ask));
            } catch {
              // The candidate still opens; the question just is not filled in.
            }
          }
          // The new Role and the signup marker (no onboarding first) are read before leaving this screen.
          await queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll });
          forgetPending();
          await router.replace(buildOrgHref({
            orgId: workspaceId,
            page: "role",
            roleId: result.roleId,
            tab: "inbox",
            inboxStage: "company_intro",
            detail: { talentId: result.talentId },
          }));
          return;
        }
        forgetPending();
      } catch (error) {
        console.warn("[org/share-link] claim", error);
        setPhase("error");
      }
    })();
  }, [args.authority, args.blocked, args.workspaceId, attempt, cta, eligible, queryClient, router, token]);

  const retry = useCallback(() => {
    setPhase("claiming");
    setAttempt((value) => value + 1);
  }, []);

  return { active: eligible, phase, retry, skip: forgetPending };
}

/** The Role screen takes the question once, for the Role it was asked on. */
export function takeShareLinkAsk(roleId: string): ShareLinkAsk | null {
  try {
    const raw = window.sessionStorage.getItem(SHARE_LINK_ASK_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<ShareLinkAsk>) : null;
    if (!value || value.roleId !== roleId || !value.talentId || !value.question) return null;
    window.sessionStorage.removeItem(SHARE_LINK_ASK_KEY);
    return { roleId, talentId: value.talentId, name: value.name ?? "", question: value.question };
  } catch {
    return null;
  }
}
