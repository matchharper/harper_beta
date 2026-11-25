import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { trackSignUp } from "@/lib/ga";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";
import { readPendingGtmInviteSignup } from "@/hooks/career/useGtmInviteClaim";
import { getCareerSignupAttributionPayload } from "@/lib/career/signupAttribution";
import {
  buildPrivacyPolicyAcknowledgement,
  recordLegalDocumentAcceptance,
} from "@/lib/legal/legalDocumentAcceptance";
import { uploadTalentDocument } from "@/lib/talentOnboarding/documentUploadClient";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";
import {
  getOfficialJobsAnonymousId,
  postOfficialJobEvent,
  type OfficialJobEventMetadata,
} from "@/lib/officialJobs/events";
import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  readActiveCareerExplicitUtmSourceFromStorage,
} from "@/lib/career/utm";
import type {
  OfficialJobsOneScreenKind,
  OfficialJobsOneScreenStep,
} from "@/lib/officialJobs/oneScreen";

export type OneScreenLocale = "ko" | "en";

/**
 * One step on the one screen, for the A/B funnel (official_job_events).
 *
 * The code route, Google sign-in and the similar-postings request carry the
 * landing id rememberOfficialJobsLanding() gives, which is the career landing id
 * instead of this browser's /jobs id while an explicit UTM is active. Then the
 * step carries that id as `lid`, so the A/B ties those sign-ups and requests
 * back to this visit.
 */
export function logOneScreenStep(
  slug: string,
  step: OfficialJobsOneScreenStep,
  metadata?: OfficialJobEventMetadata
) {
  const lid = oneScreenStepLid(
    peekOfficialJobsLanding(),
    getOfficialJobsAnonymousId({ create: false })
  );
  return postOfficialJobEvent({
    eventType: "job_onescreen_step",
    jobSlug: slug,
    metadata: { ...(metadata ?? {}), ...(lid ? { lid } : {}), step },
  });
}

/** The landing id a step names: only one that is not the /jobs id the event already carries. */
export function oneScreenStepLid(
  landingId: string | null,
  anonymousId: string | null
): string | null {
  return landingId && landingId !== anonymousId ? landingId : null;
}

/**
 * What rememberOfficialJobsLanding() returns, read without writing anything
 * (no landing keys, no new /jobs id): the career landing id while an explicit
 * UTM is active and one is kept, otherwise this browser's /jobs id.
 */
export function peekOfficialJobsLanding(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const anonymousId = getOfficialJobsAnonymousId({ create: false });
    if (readActiveCareerExplicitUtmSourceFromStorage()) {
      return (
        window.localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ||
        anonymousId
      );
    }
    return anonymousId;
  } catch {
    return null;
  }
}

/**
 * The /jobs visitor id that sign-up attribution reads, kept the same way the
 * Talk to Harper button keeps it (OfficialJobsCtaLink), so a one-screen sign-up
 * is counted on this posting's visit. peekOfficialJobsLanding() reads the same
 * answer without writing.
 */
export function rememberOfficialJobsLanding(): string | null {
  if (typeof window === "undefined") return null;
  const anonymousId = getOfficialJobsAnonymousId();
  if (!anonymousId) return null;
  try {
    if (readActiveCareerExplicitUtmSourceFromStorage()) {
      return (
        window.localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ||
        anonymousId
      );
    }
    window.localStorage.setItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY, anonymousId);
    window.localStorage.setItem(
      CAREER_UTM_SOURCE_STORAGE_KEY,
      OFFICIAL_JOBS_LANDING_SOURCE
    );
  } catch {
    // Storage blocked: attribution falls back to the URL.
  }
  return anonymousId;
}

type ApiError = { code?: string; error?: string; retryAfterSeconds?: number };

export async function requestOneScreenCode(args: {
  email: string;
  slug: string;
  kind: OfficialJobsOneScreenKind;
  locale: OneScreenLocale;
  nextPath: string;
}): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const response = await fetch("/api/official-jobs/one-screen/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...args, lid: rememberOfficialJobsLanding() }),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiError & { ok?: boolean };
  if (!response.ok || payload.ok !== true) {
    return {
      ok: false,
      code: payload.code ?? "SEND_FAILED",
      error: payload.error ?? "",
    };
  }
  return { ok: true };
}

/**
 * Confirms the code from the mail and signs the person in, recording the
 * privacy notice the card showed (as the login page and /auths/callback do).
 * Member records are created by the submit (bootstrap), as on /career/onboarding.
 */
export async function verifyOneScreenCode(args: {
  email: string;
  code: string;
  locale: OneScreenLocale;
}): Promise<{ ok: true; session: Session } | { ok: false }> {
  // "email" checks a new address's sign-up code and an existing account's login
  // code alike, so the code route never says which one the address is.
  const { data, error } = await supabase.auth.verifyOtp({
    email: args.email.trim().toLowerCase(),
    token: args.code.trim(),
    type: "email",
  });
  if (error || !data.session) return { ok: false };
  useAuthStore.getState().setLoginPersona(data.session, "talent");
  try {
    await recordLegalDocumentAcceptance({
      acceptance: buildPrivacyPolicyAcknowledgement(args.locale),
      accessToken: data.session.access_token,
    });
  } catch (error) {
    console.error("one-screen legal acceptance record error:", error);
  }
  return { ok: true, session: data.session };
}

export type OneScreenSubmitResult =
  | { status: "done"; introduction: "sent" | "failed" | "none" }
  | { status: "member" }
  | { status: "unavailable" }
  | {
      status: "error";
      message: string;
      field?: "material";
      /** Which material failed: the CV's text (upload or start), or reading the profile as a whole. */
      failedPart?: "resume" | "profile";
    };

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T;
}

/**
 * The one screen's submit for a signed-in person, in the same order as
 * /career/onboarding: bootstrap → session → materials → preferences and
 * visibility → POST /api/talent/onboarding/start (with the one screen's entry,
 * which sends a role's introduction before Harper's first turn).
 */
export async function submitOneScreenEntry(args: {
  fetchWithAuth: FetchWithAuth;
  slug: string;
  kind: "role" | "bundle";
  name: string;
  linkedinUrl: string | null;
  resumeFile: File | null;
  note: string;
  consent: boolean;
  locale: OneScreenLocale;
  onStage?: (stage: "account" | "materials" | "sending") => void;
}): Promise<OneScreenSubmitResult> {
  const { fetchWithAuth } = args;
  args.onStage?.("account");
  const localId = rememberOfficialJobsLanding();
  const bootstrap = await fetchWithAuth("/api/talent/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      ...getCareerSignupAttributionPayload({
        localId,
        source: OFFICIAL_JOBS_LANDING_SOURCE,
        path: window.location.pathname,
      }),
      ...readPendingGtmInviteSignup(),
      locale: args.locale,
    }),
  });
  const bootstrapPayload = await readJson<ApiError & { created?: boolean }>(bootstrap);
  if (!bootstrap.ok) {
    return { status: "error", message: bootstrapPayload.error ?? "" };
  }
  if (bootstrapPayload.created === true) {
    trackSignUp({ flow: "official_jobs_onescreen", method: "one_screen" });
  }

  const sessionResponse = await fetchWithAuth(
    `/api/talent/session?${new URLSearchParams({ locale: args.locale, statusOnly: "1" })}`
  );
  const sessionPayload = await readJson<
    ApiError & { conversation?: { id?: string | number | null; stage?: string | null } | null }
  >(sessionResponse);
  const conversationId = String(sessionPayload.conversation?.id ?? "");
  if (!sessionResponse.ok || !conversationId) {
    return { status: "error", message: sessionPayload.error ?? "" };
  }
  if (sessionPayload.conversation?.stage && sessionPayload.conversation.stage !== "profile") {
    return { status: "member" };
  }

  args.onStage?.("materials");
  let resume: { resumeFileName?: string; resumeStoragePath?: string; resumeDocumentId?: string } = {};
  if (args.resumeFile) {
    try {
      const uploaded = await uploadTalentDocument({
        fetchWithAuth,
        file: args.resumeFile,
        kind: "resume",
        source: "profile",
      });
      if (uploaded.hasResumeText !== true) {
        return { status: "error", message: "", field: "material", failedPart: "resume" };
      }
      resume = {
        resumeFileName: String(uploaded.resumeFileName ?? "") || undefined,
        resumeStoragePath: String(uploaded.resumeStoragePath ?? "") || undefined,
        resumeDocumentId:
          typeof uploaded.document?.id === "string" ? uploaded.document.id : undefined,
      };
    } catch {
      return { status: "error", message: "", field: "material", failedPart: "resume" };
    }
  }

  // The one screen does not ask these two (decided 11/24): full-time, as the
  // GTM-mail short sign-up, and "ask me first" before any other company.
  const preferences = await fetchWithAuth("/api/talent/preferences", {
    method: "POST",
    body: JSON.stringify({ engagementTypes: ["full_time"] }),
  });
  const settings = await fetchWithAuth("/api/talent/settings", {
    method: "POST",
    body: JSON.stringify({
      preferredLocale: args.locale,
      profileVisibility: "exceptional_only",
      profileVisibilitySource: "onboarding",
    }),
  });
  if (!preferences.ok || !settings.ok) {
    const payload = await readJson<ApiError>(preferences.ok ? settings : preferences);
    return { status: "error", message: payload.error ?? "" };
  }

  args.onStage?.("sending");
  const startBody = JSON.stringify({
    conversationId,
    applyProfileSources: true,
    ...readPendingGtmInviteSignup(),
    links: args.linkedinUrl ? [args.linkedinUrl] : [],
    locale: args.locale,
    name: args.name.trim(),
    ...resume,
    oneScreen: {
      slug: args.slug,
      kind: args.kind,
      note: args.note.trim() || undefined,
      consent: args.consent,
    },
  });
  const start = await fetchWithAuth("/api/talent/onboarding/start", {
    method: "POST",
    body: startBody,
  });
  const startPayload = await readJson<
    ApiError & { oneScreen?: { introduction?: "sent" | "failed" | "none" } }
  >(start);
  if (start.status === 202) {
    return (await waitForEntry(fetchWithAuth, conversationId))
      ? { status: "done", introduction: "none" }
      : { status: "error", message: "" };
  }
  if (!start.ok) {
    // Only this person's own earlier submit can finish the entry between the
    // session check above and here (a double click or a lost response).
    if (startPayload.code === "already_entered") return { status: "done", introduction: "none" };
    if (startPayload.code === "one_screen_unavailable") return { status: "unavailable" };
    if (startPayload.code === "resume_text_required") {
      return { status: "error", message: "", field: "material", failedPart: "resume" };
    }
    // Reading the profile failed as a whole: with a LinkedIn address only, it was the LinkedIn.
    if (startPayload.code === "profile_ingestion_failed") {
      return { status: "error", message: "", field: "material", failedPart: "profile" };
    }
    return { status: "error", message: startPayload.error ?? "" };
  }
  return {
    status: "done",
    introduction: startPayload.oneScreen?.introduction ?? "none",
  };
}

/** Another request holds this entry (a double submit): wait for it like /career/onboarding does. */
async function waitForEntry(fetchWithAuth: FetchWithAuth, conversationId: string) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetchWithAuth(
      `/api/talent/onboarding/start?${new URLSearchParams({ conversationId })}`
    );
    const payload = await readJson<{ profileIngestion?: { status?: string | null } }>(response);
    // finalize_career_entry marks the entry's ingestion completed in the same transaction.
    if (payload.profileIngestion?.status === "completed") return true;
    if (payload.profileIngestion?.status === "failed") return false;
  }
  return false;
}

/** The career href after the one screen: plain /career, where Harper's first message is being written. */
export const ONE_SCREEN_CAREER_HREF = "/career";
