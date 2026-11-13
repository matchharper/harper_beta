import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  GTM_COMPANY_INVITE_STORAGE_KEY,
  isGtmCompanyInviteId,
  type GtmCompanyInviteClaim,
  type GtmCompanyInviteState,
  type GtmCompanyInviteTeaser,
} from "@/lib/gtmPlays/companyInvite";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { buildOrgHref } from "@/lib/org/routes";
import type { WorkspaceSignupState } from "@/lib/org/signup";
import { queryKeys } from "@/lib/queryKeys";

/**
 * #2 회사 메일 → /org?gtm=<mail id>. The browser keeps the mail id through sign-in and workspace creation; once
 * the person is in a workspace they can add Roles to, the server makes the Role from the mail's posting
 * (claim) and the card follows its people until they are in "연결을 요청할 후보" (sync).
 */

// A mail opened and left for a week no longer pulls the next visit into a Role.
const PENDING_TTL_MS = 7 * 86_400_000;
// Claimed in this browser: the card follows these until their people are in (also for existing workspaces,
// which have no signup marker).
const WATCH_KEY = "harper:gtm-company-invite-watch";
const WATCH_TTL_MS = 14 * 86_400_000;

type Pending = { mailId: string; savedAt: number };
type Watch = { workspaceId: string; mailId: string; roleId: string; savedAt: number };

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === GTM_COMPANY_INVITE_STORAGE_KEY || event.key === WATCH_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The mail id waiting to be claimed in this browser, if any. */
export function readPendingGtmCompanyInvite(): string | null {
  try {
    const raw = window.localStorage.getItem(GTM_COMPANY_INVITE_STORAGE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<Pending>) : null;
    if (!value || !isGtmCompanyInviteId(value.mailId)) return null;
    if (typeof value.savedAt !== "number" || Date.now() - value.savedAt > PENDING_TTL_MS) return null;
    return value.mailId;
  } catch {
    return null;
  }
}

function rememberPending(mailId: string) {
  try {
    if (readPendingGtmCompanyInvite() === mailId) return;
    window.localStorage.setItem(GTM_COMPANY_INVITE_STORAGE_KEY, JSON.stringify({ mailId, savedAt: Date.now() }));
    notify();
  } catch {
    // Storage blocked: the ?gtm= value still works while it stays in the address.
  }
}

function forgetPending() {
  try {
    window.localStorage.removeItem(GTM_COMPANY_INVITE_STORAGE_KEY);
  } catch {
    // Nothing kept.
  }
  notify();
}

function readWatches(): Watch[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(WATCH_KEY) ?? "[]") as Watch[];
    return Array.isArray(value)
      ? value.filter((item) => item && isGtmCompanyInviteId(item.mailId) && Date.now() - item.savedAt < WATCH_TTL_MS)
      : [];
  } catch {
    return [];
  }
}

function writeWatches(next: Watch[]) {
  try {
    window.localStorage.setItem(WATCH_KEY, JSON.stringify(next.slice(-10)));
  } catch {
    // The signup marker still drives the card for new workspaces.
  }
  notify();
}

function watchSnapshot() {
  try {
    return window.localStorage.getItem(WATCH_KEY) ?? "";
  } catch {
    return "";
  }
}

export function usePendingGtmCompanyInvite() {
  return useSyncExternalStore(subscribe, readPendingGtmCompanyInvite, () => null);
}

/** /org?gtm=<mail id>: keep it before sign-in and before the entry redirects drop the query. */
export function useCaptureGtmCompanyInvite() {
  const router = useRouter();
  const fromUrl = router.isReady ? router.query.gtm : undefined;
  useEffect(() => {
    if (isGtmCompanyInviteId(fromUrl)) rememberPending(fromUrl);
  }, [fromUrl]);
  return isGtmCompanyInviteId(fromUrl) ? fromUrl : null;
}

/** Before sign-in: which posting and how many people (null when unknown). */
export function useGtmCompanyInviteTeaser(mailId: string | null) {
  return useQuery({
    queryKey: ["org", "gtm-invite-teaser", mailId ?? ""],
    enabled: Boolean(mailId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/org/gtm-invite?m=${encodeURIComponent(mailId ?? "")}`);
      const payload = (await response.json().catch(() => ({}))) as { teaser?: GtmCompanyInviteTeaser | null };
      return payload.teaser ?? null;
    },
  }).data ?? null;
}

export type GtmCompanyInviteClaimPhase = "claiming" | "error";

/**
 * Claims the waiting mail in the open workspace, then opens the Role made for it. Staff accounts and members
 * who cannot add Roles drop the mail and continue as usual. `active` while the claim screen should show.
 */
export function useGtmCompanyInviteClaim(args: {
  workspaceId: string | null;
  authority: string | null;
  /** Harper staff, or a workspace under review (no Roles can be added): the mail is dropped. */
  blocked: boolean;
}) {
  const pending = usePendingGtmCompanyInvite();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<GtmCompanyInviteClaimPhase>("claiming");
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);
  const eligible = Boolean(pending && args.workspaceId && !args.blocked &&
    (args.authority === "owner" || args.authority === "admin"));

  useEffect(() => {
    if (!pending || !args.workspaceId) return;
    if (args.blocked) {
      forgetPending();
      return;
    }
    if (!args.authority) return;
    if (!eligible) {
      forgetPending();
      return;
    }
    const key = `${pending}:${args.workspaceId}:${attempt}`;
    if (started.current === key) return;
    started.current = key;
    const workspaceId = args.workspaceId;
    setPhase("claiming");
    void (async () => {
      try {
        const result = await fetchWithInternalAuth<GtmCompanyInviteClaim>("/api/org/gtm-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim", mailId: pending, workspaceId }),
        });
        if (result.status === "claimed") {
          writeWatches([
            ...readWatches().filter((item) => !(item.workspaceId === workspaceId && item.mailId === pending)),
            { workspaceId, mailId: pending, roleId: result.state.roleId, savedAt: Date.now() },
          ]);
          // The new Role and the signup marker (no onboarding first) are read before leaving this screen.
          await queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll });
          forgetPending();
          await router.replace(buildOrgHref({ orgId: workspaceId, page: "role", roleId: result.state.roleId }));
          return;
        }
        forgetPending();
      } catch (error) {
        console.warn("[org/gtm-invite] claim", error);
        setPhase("error");
      }
    })();
  }, [args.authority, args.blocked, args.workspaceId, attempt, eligible, pending, queryClient, router]);

  const retry = useCallback(() => {
    setPhase("claiming");
    setAttempt((value) => value + 1);
  }, []);

  return { active: eligible, phase, retry, skip: forgetPending };
}

/** The mail this person claimed in this workspace: the signup marker, or a claim made in this browser. */
export function useGtmCompanyInviteSource(args: {
  workspaceId: string;
  userId: string;
  signupState: WorkspaceSignupState | null | undefined;
}) {
  const watches = useSyncExternalStore(subscribe, watchSnapshot, () => "");
  const marker = args.signupState?.gtmInvite;
  if (marker?.claimedBy === args.userId && args.signupState?.createdBy === args.userId) {
    return { mailId: marker.mailId, roleId: marker.roleId };
  }
  if (!watches) return null;
  const watch = readWatches().filter((item) => item.workspaceId === args.workspaceId).at(-1);
  return watch ? { mailId: watch.mailId, roleId: watch.roleId } : null;
}

/** Stop following a claim made in this browser (its people are in, and the card was closed). */
export function forgetGtmCompanyInviteWatch(args: { workspaceId: string; mailId: string }) {
  writeWatches(readWatches().filter((item) => !(item.workspaceId === args.workspaceId && item.mailId === args.mailId)));
}

const POLL_MS = { evaluating: 20_000, publishing: 8_000 } as const;
const POLL_FOR_MS = 45 * 60_000;

/** Progress of the claimed mail's people; asks the server to publish them once they are evaluated. */
export function useGtmCompanyInviteProgress(args: { workspaceId: string; mailId: string | null }) {
  const queryClient = useQueryClient();
  // Set by the first poll (not during render).
  const startedAt = useRef(0);
  const query = useQuery({
    queryKey: ["org", "gtm-invite", args.workspaceId, args.mailId ?? ""],
    enabled: Boolean(args.mailId),
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => (await fetchWithInternalAuth<{ state: GtmCompanyInviteState | null }>("/api/org/gtm-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", mailId: args.mailId, workspaceId: args.workspaceId }),
    })).state,
    refetchInterval: (current) => {
      const stage = current.state.data?.stage;
      if (stage !== "evaluating" && stage !== "publishing") return false;
      if (!startedAt.current) startedAt.current = Date.now();
      return Date.now() - startedAt.current < POLL_FOR_MS ? POLL_MS[stage] : false;
    },
  });
  const published = query.data?.published ?? 0;
  const seen = useRef(0);
  useEffect(() => {
    if (published <= seen.current) return;
    seen.current = published;
    // New cards: the Role's lists and counts read them again.
    void queryClient.invalidateQueries({ queryKey: queryKeys.org.boardAll });
    void queryClient.invalidateQueries({ queryKey: queryKeys.org.bootstrapAll });
  }, [published, queryClient]);
  return query.data ?? null;
}
