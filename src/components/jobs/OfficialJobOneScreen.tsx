"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { Check, ChevronDown, ChevronLeft, Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerAuth } from "@/hooks/career/useCareerAuth";
import { cn } from "@/lib/utils";
import {
  buildSafariOpenUrl,
  chooseBrowserOpenMethod,
  describeBrowserForLog,
  watchForPageLeave,
} from "@/lib/career/inAppBrowser";
import { buildPrivacyPolicyAcknowledgement } from "@/lib/legal/legalDocumentAcceptance";
import { buildOfficialJobsCareerHref, type OfficialJob } from "@/lib/officialJobs";
import type { OfficialJobsLocale } from "@/lib/officialJobs/copy";
import {
  getOfficialJobsAnonymousId,
  type OfficialJobEventMetadata,
} from "@/lib/officialJobs/events";
import {
  initialOfficialJobsOneScreenPanel,
  type OfficialJobsOneScreenArm,
  type OfficialJobsOneScreenKind,
  type OfficialJobsOneScreenPanel,
  type OfficialJobsOneScreenStep,
} from "@/lib/officialJobs/oneScreen";
import {
  logOneScreenStep,
  ONE_SCREEN_CAREER_HREF,
  rememberOfficialJobsLanding,
  submitOneScreenEntry,
  type OneScreenSubmitResult,
} from "@/lib/officialJobs/oneScreenClient";
import {
  formatOneScreenMegabytes,
  getOneScreenCopy,
} from "@/lib/officialJobs/oneScreenCopy";
import {
  checkOneScreenLinkedinUrl,
  chooseOneScreenAccountSlot,
  clearOneScreenDraft,
  getOneScreenStorage,
  hasOneScreenGoogleParam,
  isOneScreenEmail,
  isOneScreenMaterialReady,
  oneScreenBrowserUrl,
  oneScreenReturnPath,
  readOneScreenDraft,
  readOneScreenFromVisitor,
  writeOneScreenDraft,
} from "@/lib/officialJobs/oneScreenDraft";
import { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "@/lib/talentOnboarding/documentUploadLimits";
import OfficialJobOneScreenAccount, {
  useOneScreenEmailCode,
} from "@/components/jobs/OfficialJobOneScreenAccount";
import OfficialJobOneScreenMaterial, {
  type OneScreenMaterialState,
} from "@/components/jobs/OfficialJobOneScreenMaterial";
import {
  ONE_SCREEN_CIRCLED,
  ONE_SCREEN_INPUT_CLASS,
  OneScreenFieldError,
  OneScreenOrDivider,
  OneScreenFieldLabel,
  OneScreenProgressBox,
} from "@/components/jobs/OfficialJobOneScreenParts";
import OfficialJobOneScreenSimilar from "@/components/jobs/OfficialJobOneScreenSimilar";
import { OFFICIAL_JOBS_ONESCREEN_OPEN_EVENT } from "@/components/jobs/oneScreenLinks";

/**
 * The job page's one screen: sign-up and the introduction request on one card.
 *
 * The page renders it as
 *   - layout "card": the PC aside card (lg and up), in place of the Talk to Harper box;
 *   - layout "page": the full-page version at /jobs/<slug>?onescreen=1 (phones,
 *     and the target of the Safari hop from the LinkedIn app).
 */
export type OfficialJobOneScreenProps = {
  job: Pick<OfficialJob, "id" | "slug" | "companyName" | "roleTitle" | "roleId" | "companyLogoUrl">;
  kind: OfficialJobsOneScreenKind;
  /** The visitor's A/B arm; null when this posting shows the one screen without an A/B. */
  arm: OfficialJobsOneScreenArm | null;
  locale: OfficialJobsLocale;
  layout: "card" | "page";
  /** Show the white "비슷한 공고 추천받기" button (the request channel is open). */
  similarOpen: boolean;
  /** "similar": open straight on the similar-postings form (?onescreen=1&mode=similar). */
  initialMode?: "join" | "similar";
  /** The posting page without ?onescreen, for the page layout's back link. */
  postingHref: string;
};

// As the login page: the phone brings Safari up well within this; a later leave still counts.
const BROWSER_STAYED_AFTER_MS = 1500;
const BROWSER_LEAVE_WATCH_MS = 60_000;
/** Set when Google starts from the sign-up box, so the box is open again when Google sends the visitor back. */
const GOOGLE_RETURN_KEY = "harper_onescreen_google_return";
/** A Google round trip takes seconds; a mark older than this is from a Google start that never left the page. */
const GOOGLE_RETURN_MAX_MS = 15 * 60_000;

function rememberGoogleReturn(slug: string) {
  try {
    window.sessionStorage.setItem(GOOGLE_RETURN_KEY, `${Date.now()}|${slug}`);
  } catch {
    // Storage blocked: the box just starts closed after the redirect.
  }
}

function takeGoogleReturn(slug: string) {
  try {
    const value = window.sessionStorage.getItem(GOOGLE_RETURN_KEY);
    if (!value) return false;
    window.sessionStorage.removeItem(GOOGLE_RETURN_KEY);
    const split = value.indexOf("|");
    const savedAt = Number(value.slice(0, split));
    if (split < 1 || value.slice(split + 1) !== slug) return false;
    return Number.isFinite(savedAt) && Date.now() - savedAt <= GOOGLE_RETURN_MAX_MS;
  } catch {
    return false;
  }
}

/**
 * One of the one screen's two boxes: a title line that opens and closes it, and
 * its form under the line. The form stays mounted while closed, so what was
 * typed survives closing the box.
 */
function OneScreenPanelBox({
  id,
  layout,
  title,
  sub,
  open,
  disabled,
  onToggle,
  children,
}: {
  id: string;
  layout: "card" | "page";
  title: string;
  sub: string;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-beige900/10",
        layout === "page" ? "bg-bg-floating/80 shadow-(--shadow-card)" : "bg-beige50/65"
      )}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          disabled={disabled}
          onClick={onToggle}
          className="flex w-full items-start justify-between gap-3 rounded-md p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10 disabled:cursor-default"
        >
          <span className="min-w-0">
            <span className="block break-keep text-[16px] font-medium leading-6 tracking-[-0.01em] text-neutral-primary">
              {title}
            </span>
            <span className="mt-0.5 block break-keep text-[13px] leading-5 text-neutral-primary/55">
              {sub}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "mt-1 h-4 w-4 shrink-0 text-neutral-primary/55 transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
      </h2>
      <div id={`${id}-body`} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}

type JoinErrors = Partial<Record<"account" | "name" | "material" | "consent", string>>;
type SubmitStage = "account" | "materials" | "sending";

const subscribeNothing = () => () => {};
const readAccountSlot = () => chooseOneScreenAccountSlot(window.navigator.userAgent);
const readNoAccountSlot = () => null;

function readAccountName(user: User | null) {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const value = metadata.full_name || metadata.name;
  return typeof value === "string" ? value.trim() : "";
}

function isGoogleUser(user: User) {
  const providers = user.app_metadata?.providers;
  return (
    user.app_metadata?.provider === "google" ||
    (Array.isArray(providers) && providers.includes("google"))
  );
}

function readBrowserFacts() {
  const userAgent = window.navigator.userAgent;
  return describeBrowserForLog(
    userAgent,
    chooseOneScreenAccountSlot(userAgent) !== "google"
  );
}

export default function OfficialJobOneScreen({
  job,
  kind,
  locale,
  layout,
  similarOpen,
  initialMode,
  postingHref,
}: OfficialJobOneScreenProps) {
  const copy = getOneScreenCopy(locale);
  const router = useRouter();
  const idPrefix = `onescreen-${layout}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { user, authLoading, authPending, authError, handleGoogleLogin } =
    useCareerAuth();
  const { fetchWithAuth } = useCareerApi();
  // Null on the server and during hydration; the Google button shows until then.
  const slot = useSyncExternalStore(subscribeNothing, readAccountSlot, readNoAccountSlot);
  const joinKind = kind === "closed" ? null : kind;

  // Which box is open: Talk to Harper on the PC card at first, the pressed one on the phone page.
  const [openPanel, setOpenPanel] = useState<OfficialJobsOneScreenPanel | null>(() =>
    initialOfficialJobsOneScreenPanel({ layout, kind, similarOpen, initialMode })
  );
  const openPanelRef = useRef(openPanel);
  useEffect(() => {
    openPanelRef.current = openPanel;
  }, [openPanel]);
  /** null: untouched, so the signed-in account's name shows. */
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [material, setMaterial] = useState<OneScreenMaterialState>({
    linkedinOn: true,
    linkedinUrl: "",
    resumeFile: null,
  });
  const [resumeAgain, setResumeAgain] = useState(false);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [errors, setErrors] = useState<JoinErrors>({});
  const [stage, setStage] = useState<SubmitStage | null>(null);
  const [outcome, setOutcome] = useState<"member" | "unavailable" | "error" | null>(null);
  const [safariStayed, setSafariStayed] = useState(false);
  const [linkStatus, setLinkStatus] = useState("");
  /** The card was on screen (always true for the page layout). */
  const [seen, setSeen] = useState(layout === "page");

  const rootRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const linkedinRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const similarEmailRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const loggedRef = useRef(new Set<OfficialJobsOneScreenStep>());
  const submittingRef = useRef(false);
  const pendingSubmitRef = useRef(false);
  const finishedRef = useRef(false);
  const autoGoogleRef = useRef(false);
  const stopLeaveWatchRef = useRef<(() => void) | null>(null);

  const log = useCallback(
    (step: OfficialJobsOneScreenStep, metadata?: OfficialJobEventMetadata) => {
      void logOneScreenStep(job.slug, step, {
        kind,
        layout,
        // Set after a Safari hop or a copied link: the visitor id of the browser it came from.
        fromVisitor: readOneScreenFromVisitor(window.location.search),
        ...metadata,
      });
    },
    [job.slug, kind, layout]
  );
  const logOnce = useCallback(
    (step: OfficialJobsOneScreenStep, metadata?: OfficialJobEventMetadata) => {
      if (loggedRef.current.has(step)) return;
      loggedRef.current.add(step);
      log(step, metadata);
    },
    [log]
  );

  const emailCode = useOneScreenEmailCode({
    slug: job.slug,
    kind,
    locale,
    copy,
    log,
    emailRef: emailInputRef,
    codeRef: codeInputRef,
  });

  const signedInUser = authLoading ? null : user;
  const accountName = readAccountName(signedInUser);
  const name = nameInput ?? accountName;
  const nameFromGoogle =
    nameInput === null && Boolean(accountName) && Boolean(signedInUser && isGoogleUser(signedInUser));
  const linkedinValue = material.linkedinOn ? material.linkedinUrl.trim() : "";
  const linkedinUrl = linkedinValue ? checkOneScreenLinkedinUrl(linkedinValue) : null;
  const materialReady = isOneScreenMaterialReady(material);
  const busy = stage !== null;

  // view (the PC card, once it is actually on screen: below lg it is mounted
  // but hidden) or open (the full page).
  useEffect(() => {
    if (layout === "page") {
      logOnce("open", readBrowserFacts());
      if (initialMode === "similar" && similarOpen) {
        logOnce("similar_open", { via: "link" });
      }
      return;
    }
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setSeen(true);
      logOnce("view", readBrowserFacts());
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [initialMode, layout, logOnce, similarOpen]);

  // Restore what was typed before the Google redirect (after hydration).
  useEffect(() => {
    if (kind === "closed") return;
    const draft = readOneScreenDraft(getOneScreenStorage(), job.slug);
    const backFromGoogle = takeGoogleReturn(job.slug);
    const timer = window.setTimeout(() => {
      // Back from Google: the sign-up box is where they were. Something typed before:
      // open it too, unless a box was already chosen (the page's 추천받기 link).
      if (backFromGoogle) setOpenPanel("join");
      else if (draft) setOpenPanel((current) => current ?? "join");
      if (draft) {
        if (draft.name.trim()) setNameInput(draft.name);
        setMaterial((current) => ({
          ...current,
          linkedinUrl: draft.linkedinUrl,
          linkedinOn: Boolean(draft.linkedinUrl.trim()) || !draft.hadResume,
        }));
        setNote(draft.note);
        setConsent(kind === "role" && draft.consent);
        setResumeAgain(draft.hadResume);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [job.slug, kind]);

  // Saved on every change in the sign-up box, so it is already there when Google takes over
  // the page. The 추천받기 box shares the LinkedIn and file fields but leaves no draft.
  useEffect(() => {
    if (!draftReady || finishedRef.current || kind === "closed" || openPanel !== "join") return;
    writeOneScreenDraft(getOneScreenStorage(), job.slug, {
      name: nameInput ?? "",
      linkedinUrl: material.linkedinUrl,
      note,
      consent,
      hadResume: Boolean(material.resumeFile) || resumeAgain,
    });
  }, [
    consent,
    draftReady,
    job.slug,
    kind,
    material.linkedinUrl,
    material.resumeFile,
    nameInput,
    note,
    openPanel,
    resumeAgain,
  ]);

  useEffect(() => {
    if (seen && nameFromGoogle) logOnce("name_done", { source: "google" });
  }, [logOnce, nameFromGoogle, seen]);

  useEffect(() => {
    return () => {
      stopLeaveWatchRef.current?.();
    };
  }, []);

  const startGoogle = useCallback(
    (options?: { auto?: boolean; nextPath?: string }) => {
      log("google_click", options?.auto ? { auto: true } : undefined);
      // The sign-up is counted as a /jobs sign-up (the email path does the same in requestOneScreenCode).
      rememberOfficialJobsLanding();
      rememberGoogleReturn(job.slug);
      void handleGoogleLogin(buildPrivacyPolicyAcknowledgement(locale), {
        nextPath: options?.nextPath ?? oneScreenReturnPath(window.location.href),
      });
    },
    [handleGoogleLogin, job.slug, locale, log]
  );

  // Arrived from an in-app browser's "Safari에서 Google로" (os_google=1):
  // start Google once in a normal browser, and drop the param either way.
  useEffect(() => {
    if (layout !== "page" || autoGoogleRef.current) return;
    if (!router.isReady || authLoading || slot === null) return;
    if (!hasOneScreenGoogleParam(window.location.search)) return;
    autoGoogleRef.current = true;
    const returnPath = oneScreenReturnPath(window.location.href);
    void router.replace(returnPath, undefined, { shallow: true, scroll: false });
    if (user || slot !== "google" || kind === "closed") return;
    startGoogle({ auto: true, nextPath: returnPath });
  }, [authLoading, kind, layout, router, slot, startGoogle, user]);

  const handleGoogle = () => {
    setErrors((current) => ({ ...current, account: undefined }));
    startGoogle();
  };

  const copyBrowserLink = async () => {
    let ok = false;
    try {
      await window.navigator.clipboard.writeText(
        oneScreenBrowserUrl(window.location.href, getOfficialJobsAnonymousId())
      );
      ok = true;
    } catch {
      ok = false;
    }
    setLinkStatus(ok ? copy.copyLinkDone : copy.copyLinkFailed);
    log("copy_link", { ok, slot });
  };

  // iPhone LinkedIn: ask iOS for Safari, then watch whether the page was left.
  const openSafari = () => {
    const safariUrl = buildSafariOpenUrl(oneScreenBrowserUrl(window.location.href, getOfficialJobsAnonymousId()));
    if (!safariUrl) return;
    setLinkStatus("");
    log("safari_click");
    stopLeaveWatchRef.current?.();
    stopLeaveWatchRef.current = watchForPageLeave({
      doc: document,
      win: window,
      stayedAfterMs: BROWSER_STAYED_AFTER_MS,
      watchMs: BROWSER_LEAVE_WATCH_MS,
      onLeft: () => log("safari_left"),
      onReplaced: () => log("safari_left", { replaced: true }),
      onStayed: () => {
        log("safari_stayed");
        setSafariStayed(true);
      },
    });
    window.location.href = safariUrl;
  };

  // Another in-app browser: Chrome intent on Android, a new window elsewhere.
  const openInBrowser = () => {
    const target = oneScreenBrowserUrl(window.location.href, getOfficialJobsAnonymousId());
    setLinkStatus("");
    if (chooseBrowserOpenMethod(window.navigator.userAgent) === "android_intent") {
      const url = new URL(target);
      window.location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(
        ":",
        ""
      )};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
      return;
    }
    const opened = window.open(target, "_blank");
    if (opened) {
      opened.opener = null;
    } else {
      void copyBrowserLink();
    }
  };

  const updateMaterial = (next: Partial<OneScreenMaterialState>) => {
    setMaterial((current) => ({ ...current, ...next }));
    setErrors((current) => ({ ...current, material: undefined }));
  };

  const focusFirstMissing = (missing: JoinErrors) => {
    if (missing.account) {
      (emailCode.sentTo ? codeInputRef : emailInputRef).current?.focus();
    } else if (missing.name) {
      nameRef.current?.focus();
    } else if (missing.material) {
      linkedinRef.current?.focus();
    } else if (missing.consent) {
      consentRef.current?.focus();
    }
  };

  const submit = async (options?: { justVerified?: boolean }) => {
    if (!joinKind || submittingRef.current || authLoading) return;
    // A code confirmed after the box was closed still sends from here: show where it goes.
    setOpenPanel("join");
    const signedIn = Boolean(options?.justVerified || signedInUser);
    const missing: JoinErrors = {};
    if (!signedIn) {
      missing.account = emailCode.sentTo ? copy.codeRequired : copy.accountRequired;
    }
    if (!name.trim()) missing.name = copy.nameRequired;
    if (linkedinValue && !linkedinUrl) missing.material = copy.linkedinInvalid;
    else if (!materialReady) missing.material = copy.materialRequired;
    if (joinKind === "role" && !consent) missing.consent = copy.consentRequired;
    const missingKeys = Object.keys(missing);
    log("submit_click", {
      ready: missingKeys.length === 0,
      missing: missingKeys.join(",") || null,
      auto: options?.justVerified ? true : undefined,
    });

    if (missingKeys.length > 0) {
      setOutcome(null);
      if (!signedIn) {
        // Signing up is part of this button: the person's intro goes once the code is confirmed.
        pendingSubmitRef.current = true;
        if (!emailCode.sentTo && isOneScreenEmail(emailCode.email)) {
          setErrors({ ...missing, account: undefined });
          void emailCode.send();
          return;
        }
      }
      setErrors(missing);
      focusFirstMissing(missing);
      return;
    }

    submittingRef.current = true;
    pendingSubmitRef.current = false;
    setErrors({});
    setOutcome(null);
    setStage("account");
    let result: OneScreenSubmitResult;
    try {
      result = await submitOneScreenEntry({
        fetchWithAuth,
        slug: job.slug,
        kind: joinKind,
        name: name.trim(),
        linkedinUrl,
        resumeFile: material.resumeFile,
        note: joinKind === "role" ? note : "",
        consent: joinKind === "role" && consent,
        locale,
        onStage: setStage,
      });
    } catch (error) {
      result = {
        status: "error",
        message: error instanceof Error ? error.message : "",
      };
    }

    if (result.status === "done") {
      finishedRef.current = true;
      clearOneScreenDraft(getOneScreenStorage(), job.slug);
      log("submit_ok", { introduction: result.introduction });
      // The button stays busy while /career opens.
      void router.push(ONE_SCREEN_CAREER_HREF);
      return;
    }
    submittingRef.current = false;
    setStage(null);
    if (result.status === "member" || result.status === "unavailable") {
      finishedRef.current = true;
      clearOneScreenDraft(getOneScreenStorage(), job.slug);
      log("submit_error", { result: result.status });
      setOutcome(result.status);
      return;
    }
    if (result.field === "material") {
      log("submit_error", { result: "material" });
      setErrors({
        material: copy.materialFailed({
          part: result.failedPart ?? "profile",
          linkedin: Boolean(linkedinUrl),
          resume: Boolean(material.resumeFile),
        }),
      });
      linkedinRef.current?.focus();
      return;
    }
    log("submit_error", {
      result: "error",
      message: result.message.slice(0, 200) || null,
    });
    setOutcome("error");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const handleVerified = () => {
    setErrors((current) => ({ ...current, account: undefined }));
    if (!pendingSubmitRef.current) return;
    pendingSubmitRef.current = false;
    void submit({ justVerified: true });
  };

  const togglePanel = (panel: OfficialJobsOneScreenPanel) => {
    if (openPanel === panel) {
      setOpenPanel(null);
      return;
    }
    setOpenPanel(panel);
    log(panel === "similar" ? "similar_open" : "join_open", { via: "box" });
    if (panel === "similar") {
      window.setTimeout(() => similarEmailRef.current?.focus(), 0);
    }
  };

  // A Talk to Harper outside the card (layout B's closing button) scrolls to the card: open the
  // sign-up box, or on a closed role the only box there is.
  useEffect(() => {
    const target: OfficialJobsOneScreenPanel | null = joinKind ? "join" : similarOpen ? "similar" : null;
    if (layout !== "card" || !target) return;
    const openBox = () => {
      if (openPanelRef.current !== target) {
        log(target === "similar" ? "similar_open" : "join_open", { via: "talk_to_harper" });
      }
      setOpenPanel(target);
    };
    window.addEventListener(OFFICIAL_JOBS_ONESCREEN_OPEN_EVENT, openBox);
    return () => window.removeEventListener(OFFICIAL_JOBS_ONESCREEN_OPEN_EVENT, openBox);
  }, [joinKind, layout, log, similarOpen]);

  const careerHref = buildOfficialJobsCareerHref({
    companyName: job.companyName,
    roleTitle: job.roleTitle,
    slug: job.slug,
    roleId: job.roleId,
  });

  const titleId = `${idPrefix}-title`;
  const nameId = `${idPrefix}-name`;
  const noteId = `${idPrefix}-note`;
  const consentId = `${idPrefix}-consent`;
  const eyebrow = [job.companyName, job.roleTitle].filter(Boolean).join(" · ");
  const EyebrowTag = layout === "page" ? "h1" : "p";
  const sectionGap = layout === "page" ? "mt-7" : "mt-6";

  const progressBox = (
    <OneScreenProgressBox
      id={`${idPrefix}-progress`}
      layout={layout}
      title={copy.progress}
      rows={copy.progressRows.map((label, index) => ({
        label,
        done: [Boolean(signedInUser), Boolean(name.trim()), materialReady][index],
      }))}
    />
  );

  const outcomeBox =
    outcome === "member" || outcome === "unavailable" ? (
      <div
        role="status"
        className="rounded-md border border-beige900/10 bg-bg-floating/80 p-4"
      >
        <p className="break-keep text-[14px] font-medium leading-6 text-neutral-primary">
          {outcome === "member" ? copy.member : copy.unavailable}
        </p>
        <p className="mt-1 break-keep text-[13px] leading-5 text-neutral-primary/60">
          {copy.notSent}
        </p>
        <MuteButton asChild variant="dark" size="lg" className="mt-3 w-full">
          <Link
            href={careerHref}
            onClick={() => log("member_continue", { result: outcome })}
          >
            {copy.continueOnHarper}
          </Link>
        </MuteButton>
      </div>
    ) : null;

  const similarForm = similarOpen ? (
    <OfficialJobOneScreenSimilar
      copy={copy}
      idPrefix={idPrefix}
      layout={layout}
      slug={job.slug}
      kind={kind}
      locale={locale}
      defaultEmail={signedInUser?.email || emailCode.email}
      material={material}
      onMaterialChange={(next) => setMaterial((current) => ({ ...current, ...next }))}
      log={log}
      emailInputRef={similarEmailRef}
    />
  ) : null;

  const joinForm = joinKind ? (
      <form noValidate onSubmit={handleSubmit}>
        {progressBox}

        <div className={sectionGap}>
          <OfficialJobOneScreenAccount
            copy={copy}
            locale={locale}
            idPrefix={idPrefix}
            slot={slot}
            authLoading={authLoading}
            signedIn={
              signedInUser
                ? { email: signedInUser.email ?? "", google: isGoogleUser(signedInUser) }
                : null
            }
            googlePending={authPending}
            disabled={busy}
            onGoogle={handleGoogle}
            onSafari={openSafari}
            onOpenInBrowser={openInBrowser}
            onCopyLink={() => void copyBrowserLink()}
            safariStayed={safariStayed}
            linkStatus={linkStatus}
            emailCode={emailCode}
            emailInputRef={emailInputRef}
            codeInputRef={codeInputRef}
            onVerified={handleVerified}
            error={errors.account || authError}
          />
        </div>

        <div className={sectionGap}>
          <OneScreenFieldLabel htmlFor={nameId}>
            {ONE_SCREEN_CIRCLED[1]} {nameFromGoogle ? copy.nameFromGoogle : copy.nameLabel}
          </OneScreenFieldLabel>
          <Input
            ref={nameRef}
            id={nameId}
            autoComplete="name"
            placeholder={copy.nameLabel}
            value={name}
            disabled={busy}
            onChange={(event) => {
              setNameInput(event.target.value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            onBlur={() => {
              if (name.trim()) logOnce("name_done", { source: nameInput === null ? "google" : "typed" });
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={`${nameId}-error`}
            className={ONE_SCREEN_INPUT_CLASS}
          />
          <OneScreenFieldError id={`${nameId}-error`} message={errors.name} />
        </div>

        <div className={sectionGap}>
          <OfficialJobOneScreenMaterial
            copy={copy}
            idPrefix={idPrefix}
            label={`${ONE_SCREEN_CIRCLED[2]} ${copy.materialLabel}`}
            layout={layout}
            state={material}
            disabled={busy}
            linkedinInputRef={linkedinRef}
            onLinkedinOnChange={(on) => {
              updateMaterial({ linkedinOn: on });
              if (on) window.setTimeout(() => linkedinRef.current?.focus(), 0);
            }}
            onLinkedinUrlChange={(value) => updateMaterial({ linkedinUrl: value })}
            onLinkedinBlur={() => {
              if (!linkedinValue) return;
              if (linkedinUrl) {
                logOnce("material_done", { material: "linkedin" });
              } else {
                setErrors((current) => ({ ...current, material: copy.linkedinInvalid }));
              }
            }}
            onResumeFile={(file) => {
              if (file && file.size > MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES) {
                setErrors((current) => ({
                  ...current,
                  material: copy.fileTooLarge(
                    formatOneScreenMegabytes(MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES)
                  ),
                }));
                return;
              }
              updateMaterial({ resumeFile: file });
              setResumeAgain(false);
              if (file) logOnce("material_done", { material: "resume" });
            }}
            onResumeReject={() =>
              setErrors((current) => ({ ...current, material: copy.fileType }))
            }
            error={errors.material}
            resumeAgain={resumeAgain}
          />
        </div>

        {joinKind === "role" ? (
          <>
            <div className={sectionGap}>
              <OneScreenFieldLabel htmlFor={noteId}>{copy.noteLabel}</OneScreenFieldLabel>
              <Textarea
                id={noteId}
                rows={3}
                placeholder={copy.notePlaceholder}
                value={note}
                disabled={busy}
                onChange={(event) => setNote(event.target.value)}
                className="text-base lg:text-sm"
              />
            </div>
            <div className="mt-5">
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  ref={consentRef}
                  id={consentId}
                  size="medium"
                  checked={consent}
                  disabled={busy}
                  required
                  onChange={(event) => {
                    setConsent(event.target.checked);
                    setErrors((current) => ({ ...current, consent: undefined }));
                    if (event.target.checked) logOnce("consent_checked");
                  }}
                  aria-invalid={errors.consent ? true : undefined}
                  aria-describedby={`${consentId}-error`}
                  className="mt-0.5"
                />
                <span className="break-keep text-[13px] leading-5 text-neutral-primary">
                  {copy.consent(job.companyName, Boolean(material.resumeFile))}
                </span>
              </label>
              <OneScreenFieldError id={`${consentId}-error`} message={errors.consent} />
            </div>
          </>
        ) : (
          <p className="mt-5 break-keep text-[12px] leading-5 text-neutral-primary/55">
            {copy.bundleAskFirst}
          </p>
        )}

        <div className="mt-6">
          {outcomeBox ?? (
            <>
              <MuteButton
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
              >
                {stage ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                <span>{stage ? copy.stage[stage] : copy.submit[joinKind]}</span>
              </MuteButton>
              <OneScreenFieldError
                id={`${idPrefix}-submit-error`}
                message={outcome === "error" ? copy.retry : null}
              />
            </>
          )}
        </div>
      </form>
  ) : null;

  // Two boxes, one open at a time: sign up and get introduced, or similar postings by mail.
  const boxes = (
    <div className="space-y-3">
      {joinKind && joinForm ? (
        <OneScreenPanelBox
          id={`${idPrefix}-join`}
          layout={layout}
          title={copy.title[joinKind]}
          sub={copy.sub[joinKind]}
          open={openPanel === "join"}
          disabled={busy}
          onToggle={() => togglePanel("join")}
        >
          {joinForm}
        </OneScreenPanelBox>
      ) : null}
      {joinKind && joinForm && similarForm ? (
        <OneScreenOrDivider label={copy.divider} />
      ) : null}
      {similarForm ? (
        <OneScreenPanelBox
          id={`${idPrefix}-similar`}
          layout={layout}
          title={kind === "closed" ? copy.title.closed : copy.similarButton}
          sub={copy.similarSub}
          open={openPanel === "similar"}
          disabled={busy}
          onToggle={() => togglePanel("similar")}
        >
          {similarForm}
        </OneScreenPanelBox>
      ) : null}
      {!joinForm && !similarForm ? (
        <MuteButton asChild size="lg" className="w-full">
          <Link href="/jobs">{copy.otherJobs}</Link>
        </MuteButton>
      ) : null}
    </div>
  );

  const eyebrowLine = eyebrow ? (
    <EyebrowTag
      id={titleId}
      className="break-keep text-[13px] font-medium leading-5 text-neutral-primary/55"
    >
      {eyebrow}
    </EyebrowTag>
  ) : null;

  if (layout === "page") {
    return (
      <div
        className="min-h-svh w-full bg-bg-default bg-linear-to-b from-bg-floating to-bg-default pb-[max(env(safe-area-inset-bottom),6.5rem)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-neutral-primary"
      >
        <div className="mx-auto w-full max-w-[480px] px-5 pt-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center">
              <Image src="/svgs/logov2.svg" alt="Harper" width={64} height={29} priority />
            </Link>
            <Link
              href={postingHref}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-primary/55 transition hover:text-neutral-primary"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {copy.backToPosting}
            </Link>
          </div>
          <section aria-labelledby={eyebrow ? titleId : undefined} className="mt-10">
            {eyebrowLine}
            <div className={eyebrow ? "mt-3" : undefined}>{boxes}</div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <section ref={rootRef} aria-labelledby={eyebrow ? titleId : undefined}>
      {eyebrowLine}
      <div className={eyebrow ? "mt-2" : undefined}>{boxes}</div>
    </section>
  );
}
