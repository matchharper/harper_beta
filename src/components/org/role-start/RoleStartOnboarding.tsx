import { useRoleStartQuery, roleStartMutationOptions, type RoleStartMutationResult as MutationResult, type RoleStartResponse } from "@/hooks/org/useRoleStart";
import { queryKeys } from "@/lib/queryKeys";
import {
  RoleStartCentered as Centered,
  RoleStartSplit as SplitStep,
  RoleStartPane as SplitPane,
  RoleStartStepHeader,
} from "./RoleStartLayout";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { roleSetupReply } from "@/lib/org/roleStart/setupReply";
import { billingErrorCopy } from "@/lib/org/billing/types";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { registerMissingMessage } from "@/components/org/role-start/OrgRoleStartPanel";
import { RoleStartPreparation } from "@/components/org/role-start/RoleStartPreparation";
import { RoleBriefFields } from "@/components/org/role-start/RoleBriefFields";
import {
  Field,
  RoleReferenceInput,
  referenceRowsToSend,
  type ReferenceDraft,
} from "@/components/org/role-start/RoleReferenceInput";
import {
  CandidateRating,
  type RoleStartEvaluateBody,
} from "@/components/org/role-start/RoleStartCandidate";
import {
  RoleStartCandidateProfile,
  type FirstThreeProfile,
} from "@/components/org/role-start/RoleStartCandidateProfile";
import {
  ROLE_START_STEPS,
  roleStartStepOf,
  type RoleStartStepId,
} from "@/components/org/role-start/roleStartSteps";
import { RoleToggleButton } from "@/components/org/role-overview/RoleOverviewShared";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DocumentEditor } from "@/components/ui/document-editor";
import { useOrgDocumentEditorCopy } from "@/i18n/org/useOrgDocumentEditorCopy";
import RichText from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import {
  useOrgAgentChat,
  useOrgAgentMessageHistory,
} from "@/hooks/org/useOrgAgent";
import { useOrgRoleNotificationSettings } from "@/hooks/org/useOrgRoleNotifications";
import { useConnectOrgSlack, useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  DEFAULT_INTRO_SEARCH_DAYS,
  DEFAULT_INTRO_SEARCH_HOUR,
  INTRO_SEARCH_DAYS,
  type IntroSearchDay,
} from "@/lib/org/introSearchSchedule";
import {
  ORG_ROLE_EMPLOYMENT_TYPE_VALUES,
  ORG_ROLE_WORK_MODE_VALUES,
} from "@/lib/org/roleFieldValues";
import type {
  RoleStartBriefView,
  RoleStartView,
} from "@/lib/org/roleStart/view";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

type Issue = { level: "conflict"; text: string };
export { useRoleStartQuery } from "@/hooks/org/useRoleStart";
export type { RoleStartResponse } from "@/hooks/org/useRoleStart";

/** Every draft opens Setup, including drafts whose Brief has not started or failed. */
export function isRoleStartOnboarding(
  role: OrgRole | null,
  data?: RoleStartResponse
) {
  return Boolean(
    role &&
    String(role.status ?? "").toLowerCase() === "draft" &&
    data?.session?.phase !== "done" &&
    data?.session?.phase !== "superseded"
  );
}

function readFlag(key: string) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // The flag only remembers the screen's place; the step still works without it.
  }
}

/**
 * The role start flow as one centered screen with a step bar: role info,
 * Brief (questions, then the Brief beside a change box), rating the first
 * three (rating left, the person right), and finishing.
 */
export function RoleStartOnboarding({
  role,
  workspaceId,
  onRoleCreated,
}: {
  role: OrgRole;
  workspaceId: string;
  onRoleCreated?: (roleId: string) => void;
}) {
  const { c } = useOrgLocale();
  const { permissions } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const queryClient = useQueryClient();
  // Keep Setup mounted after the first chat save, including unsent reference
  // profiles. Move to the Role URL when the team continues to Brief.
  const [createdRoleId, setCreatedRoleId] = useState("");
  const roleId = role.roleId || createdRoleId;
  const query = useRoleStartQuery(roleId, workspaceId);
  const queryKey = useMemo(
    () => queryKeys.org.roleStart(workspaceId, roleId),
    [roleId, workspaceId]
  );
  const mutation = useMutation({
    ...roleStartMutationOptions(queryClient, workspaceId, roleId),
    onError: (cause) => {
      addToast({
        message:
          cause instanceof Error
            ? cause.message
            : c("요청을 처리하지 못했어요.", "Request failed."),
        variant: "error",
      });
      // Changed elsewhere meanwhile (e.g. a Brief edit): show the latest.
      if ((cause as { status?: number }).status === 409)
        void queryClient.invalidateQueries({ queryKey });
    },
  });
  const run = (body: Record<string, unknown>) =>
    mutation.mutateAsync(body).catch(() => null);
  const busy = mutation.isPending || !canManage;

  const setupKey = `role-start-setup:${roleId}`;
  const [setupDone, setSetupDone] = useState(false);
  const finalizeKey = `role-start-finalize:${roleId}`;
  const [finalizeOpen, setFinalizeOpenState] = useState(false);
  const setFinalizeOpen = (open: boolean) => {
    writeFlag(finalizeKey, open);
    setFinalizeOpenState(open);
  };
  useEffect(() => {
    setSetupDone(readFlag(setupKey));
    setFinalizeOpenState(readFlag(finalizeKey));
  }, [finalizeKey, setupKey]);

  const [historyRoleId, setHistoryRoleId] = useState<string | null>(null);
  const reviewingQuestions = historyRoleId === roleId;
  const session = query.data?.session ?? null;
  const phaseStep = roleStartStepOf(session?.phase ?? null);
  const step: RoleStartStepId =
    phaseStep === "brief" && !setupDone
      ? "setup"
      : phaseStep === "setup" && setupDone && session?.phase === "drafting"
        ? "brief"
        : phaseStep === "align" &&
            finalizeOpen &&
            session?.phase === "evaluating"
          ? "finalize"
          : phaseStep;

  if (role.roleId && query.isLoading && !query.data)
    return <RoleStartPreparation />;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-default">
      <StepBar current={step} />
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-8 md:px-8 md:pt-12",
          (step === "setup" ||
            !session ||
            (session &&
              !session.stalled &&
              ((step === "brief" &&
                session.phase === "review" &&
                !reviewingQuestions &&
                !query.data?.compensation) ||
                step === "align"))) &&
            "md:overflow-hidden md:p-0",
          step === "brief" &&
            session &&
            !session.stalled &&
            (query.data?.compensation ||
              reviewingQuestions ||
              session.phase !== "review") &&
            "flex flex-col py-8 md:py-12"
        )}
      >
        {query.isError ? (
          <Centered>
            <p role="alert" className="text-sm text-critical">
              {c(
                "채용 시작 정보를 불러오지 못했어요.",
                "Could not load hiring setup."
              )}
            </p>
            <MuteButton
              className="mt-3 self-start"
              onClick={() => void query.refetch()}
            >
              {c("다시 시도", "Try again")}
            </MuteButton>
          </Centered>
        ) : !session || step === "setup" ? (
          <SetupStep
            busy={busy || (Boolean(roleId) && query.isLoading)}
            onCreated={onRoleCreated}
            onDraftSaved={setCreatedRoleId}
            onStart={(createdRoleId) =>
              run({ action: "start", roleId: createdRoleId })
            }
            hasDescription={query.data?.role.hasDescription ?? false}
            onAddReferences={async (people) => {
              const result = await run({ action: "add_references", people });
              if (result)
                addToast({
                  message: c(
                    "참고 인물을 받았어요. 읽은 뒤 여기에 보여요.",
                    "Got the reference people. They show here once read."
                  ),
                  variant: "success",
                });
              return Boolean(result);
            }}
            onNext={() => {
              writeFlag(setupKey, true);
              setSetupDone(true);
              if (!role.roleId) onRoleCreated?.(roleId);
            }}
            onRemoveReference={(referenceId) =>
              void run({ action: "remove_reference", referenceId })
            }
            onRetry={() =>
              run({ action: session?.stalled ? "retry" : "start" })
            }
            onRoleInfoChanged={(fields) =>
              void run({ action: "role_info", fields })
            }
            refresh={() => queryClient.invalidateQueries({ queryKey })}
            role={
              query.data?.role
                ? { ...role, ...query.data.role, roleId, status: role.status }
                : { ...role, roleId }
            }
            session={session}
            workspaceId={workspaceId}
          />
        ) : session.stalled ? (
          <Centered>
            <p className="text-[14px] text-neutral-muted">
              {c(
                "진행이 멈춘 것 같아요. 다시 시도할 수 있어요.",
                "This step seems to have stopped. You can try again."
              )}
            </p>
            <MuteButton
              className="mt-3"
              disabled={busy}
              onClick={() => run({ action: "retry" })}
            >
              {c("다시 시도", "Try again")}
            </MuteButton>
          </Centered>
        ) : step === "brief" ? (
          query.data?.compensation ? (
            <CompensationQuestion
              busy={busy}
              chips={query.data.compensation.chips}
              onAnswer={(body) => run({ action: "compensation", ...body })}
            />
          ) : session.phase === "review" && !reviewingQuestions ? (
            <BriefStep
              busy={busy}
              // An answer still being applied: the Brief shows now; its fields and
              // confirming wait until it lands.
              refining={session.refining}
              issues={query.data?.issues ?? []}
              onBack={() => {
                if (
                  session.questions.history.length ||
                  session.questions.compensation
                )
                  setHistoryRoleId(roleId);
                else {
                  writeFlag(setupKey, false);
                  setSetupDone(false);
                }
              }}
              onConfirm={() => run({ action: "confirm" })}
              onRequest={async (request) => {
                const result = await run({ action: "edit", request });
                if (result?.applied)
                  addToast({ message: result.applied, variant: "success" });
                return Boolean(result);
              }}
              onSave={(brief) =>
                run({
                  action: "edit",
                  brief,
                  briefHash: session.briefHash,
                  summaryEdited: brief.summary !== session.brief.summary,
                })
              }
              session={session}
            />
          ) : (
            <QuestionStep
              key={roleId}
              reviewHistory={reviewingQuestions}
              salaryRange={query.data?.role.salaryRange ?? null}
              onReturnToReview={() => setHistoryRoleId(null)}
              busy={busy}
              onAnswer={(body) =>
                session.pendingQuestion &&
                run({
                  action: "answer",
                  questionId: session.pendingQuestion.id,
                  ...body,
                })
              }
              onBack={() => {
                setHistoryRoleId(null);
                writeFlag(setupKey, false);
                setSetupDone(false);
              }}
              onFinish={() => run({ action: "finish_questions" })}
              session={session}
            />
          )
        ) : step === "align" ? (
          <AlignStep
            busy={busy}
            onEvaluate={(body) => run({ action: "evaluate", ...body })}
            onNext={() => setFinalizeOpen(true)}
            onReopen={() => run({ action: "reopen_review" })}
            onWiden={(conditionId) =>
              run({ action: "widen_condition", conditionId })
            }
            profiles={query.data?.profiles ?? {}}
            session={session}
          />
        ) : (
          <FinalizeStep
            busy={busy}
            onBack={() => setFinalizeOpen(false)}
            onRegister={async (notification) => {
              const result = await run({ action: "register", ...notification });
              if (result?.missingFields?.length) {
                addToast({
                  message: registerMissingMessage(c, result.missingFields),
                  variant: "error",
                });
              }
            }}
            role={role}
            session={session}
            workspaceId={workspaceId}
          />
        )}
      </div>
    </div>
  );
}

function StepBar({ current }: { current: RoleStartStepId }) {
  const { c } = useOrgLocale();
  const index = ROLE_START_STEPS.findIndex((item) => item.id === current);
  return (
    <nav
      aria-label={c("진행 단계", "Progress")}
      className="shrink-0 border-b border-neutral-1000-a05 px-4 py-3 md:px-0"
    >
      <ol className="mx-auto flex max-w-[760px] items-center gap-2">
        {ROLE_START_STEPS.map((item, position) => (
          <li className="flex min-w-0 flex-1 flex-col gap-1.5" key={item.id}>
            <span
              aria-hidden
              className={cn(
                "h-1 rounded-full",
                position <= index ? "bg-neutral-1000" : "bg-neutral-1000-a10"
              )}
            />
            <span
              aria-current={position === index ? "step" : undefined}
              className={cn(
                "truncate text-[12px] leading-4",
                position === index
                  ? "font-medium text-neutral-primary"
                  : "text-neutral-soft"
              )}
            >
              {c(item.ko, item.en)}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function LoadingLine({ text, hint }: { text: string; hint?: string }) {
  return (
    <div aria-live="polite" className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-[14px] text-neutral-primary">
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin text-neutral-muted"
        />
        {text}
      </span>
      {hint ? (
        <span className="pl-6 text-[12px] leading-5 text-neutral-soft">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function DoneLine({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2 text-[14px] text-neutral-primary">
      <Check aria-hidden className="size-4 text-positive" />
      {text}
    </span>
  );
}

// ---------------------------------------------------------------- setup

const WORK_MODE_LABEL: Record<string, [string, string]> = {
  onsite: ["오피스 근무", "On-site"],
  hybrid: ["하이브리드", "Hybrid"],
  remote: ["원격 근무", "Remote"],
};

const EMPLOYMENT_LABEL: Record<string, [string, string]> = {
  full_time: ["정규직", "Full-time"],
  part_time: ["파트타임", "Part-time"],
  internship: ["인턴", "Internship"],
  contract: ["계약직", "Contract"],
};

type RoleInfo = {
  name: string;
  locationText: string;
  workMode: string | null;
  employmentTypes: string[];
  salaryRange: string;
  description: string;
};

function roleInfoOf(role: OrgRole): RoleInfo {
  return {
    name: role.name === "새 역할" ? "" : role.name,
    locationText: role.locationText ?? "",
    workMode: role.workMode,
    employmentTypes: role.employmentTypes,
    salaryRange: role.salaryRange ?? "",
    description: role.description ?? "",
  };
}

/** Role facts read from the JD, to check while Harper drafts the Brief. */
function SetupStep(props: {
  busy: boolean;
  hasDescription: boolean;
  role: OrgRole;
  session: RoleStartView | null;
  workspaceId: string;
  onAddReferences: (
    people: NonNullable<ReturnType<typeof referenceRowsToSend>>
  ) => Promise<boolean>;
  onNext: () => void;
  onCreated?: (roleId: string) => void;
  onDraftSaved: (roleId: string) => void;
  onStart: (roleId: string) => Promise<MutationResult | null>;
  onRemoveReference: (referenceId: string) => void;
  onRetry: () => void;
  onRoleInfoChanged: (fields: string[]) => void;
  refresh: () => Promise<unknown>;
}) {
  const { c } = useOrgLocale();
  // 참고 인물 rows: sent with 다음 (the Brief has started by then).
  const [references, setReferences] = useState<ReferenceDraft[]>([]);
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const documentEditorCopy = useOrgDocumentEditorCopy();
  const { user } = useOrgWorkspace();
  const history = useOrgAgentMessageHistory({
    mode: "role_creation",
    roleId: props.role.roleId,
    workspaceId: props.workspaceId,
  });
  const chat = useOrgAgentChat({
    appendMessagesToCache: history.appendMessagesToCache,
    currentUserId: user.id,
    mode: "role_creation",
    roleId: props.role.roleId,
    workspaceId: props.workspaceId,
  });
  const draftRoleId = useRef<string | null>(null);
  const ensureRole = async () => {
    if (props.role.roleId) return props.role.roleId;
    draftRoleId.current ??= crypto.randomUUID();
    const result = await fetchWithInternalAuth<{ roleId: string }>(
      "/api/org/role-start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          roleId: draftRoleId.current,
          workspaceId: props.workspaceId,
        }),
      }
    );
    return result.roleId;
  };
  const [request, setRequest] = useState("");
  const hasRequest = Boolean(request.trim());
  const [submitting, setSubmitting] = useState(false);
  const busy =
    props.busy || updateRole.isPending || chat.isStreaming || submitting;
  // Render only completed role-writing responses, never an unscoped chat stream.
  const reply = roleSetupReply(history.messages);
  const saved = roleInfoOf(props.role);
  // Only the fields the company changed: the rest keep following what Harper
  // reads from the JD, so a late read never overwrites the company's input.
  const [edits, setEdits] = useState<Partial<RoleInfo>>({});
  const info: RoleInfo = { ...saved, ...edits };
  // The role facts registration requires (getRoleCreationMissingFields), asked for on this step.
  const invalid = {
    name: !info.name.trim() || info.name.trim() === "새 역할",
    locationText: !info.locationText.trim(),
    workMode: !info.workMode,
    employmentTypes: info.employmentTypes.length === 0,
  };
  const setDraft = (next: RoleInfo) =>
    setEdits((current) => {
      const changed: Partial<RoleInfo> = { ...current };
      for (const key of Object.keys(next) as Array<keyof RoleInfo>) {
        if (JSON.stringify(next[key]) !== JSON.stringify(info[key]))
          (changed as Record<string, unknown>)[key] = next[key];
      }
      return changed;
    });
  const dirty = (Object.keys(edits) as Array<keyof RoleInfo>).some(
    (key) => JSON.stringify(edits[key]) !== JSON.stringify(saved[key])
  );
  const phase = props.session?.phase ?? null;
  const refreshRef = useRef(props.refresh);
  refreshRef.current = props.refresh;
  const missingFacts =
    !saved.name || !saved.workMode || saved.employmentTypes.length === 0;
  useEffect(() => {
    // Harper saves the role facts partway through reading the JD; read them
    // again until they are in (or for a minute at most).
    if (!props.role.roleId || (!missingFacts && phase !== null)) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 60_000) window.clearInterval(timer);
      else refreshRef.current();
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [missingFacts, phase, props.role.roleId]);

  const save = async () => {
    try {
      const roleId = await ensureRole();
      if (dirty) {
        await updateRole.mutateAsync({
          roleId,
          workspaceId: props.workspaceId,
          ...("name" in edits && info.name.trim()
            ? { name: info.name.trim() }
            : {}),
          ...("locationText" in edits
            ? { locationText: info.locationText.trim() || null }
            : {}),
          ...("workMode" in edits ? { workMode: info.workMode } : {}),
          ...("employmentTypes" in edits
            ? { employmentTypes: info.employmentTypes }
            : {}),
          ...("description" in edits
            ? { description: info.description.trim() || null }
            : {}),
          ...("salaryRange" in edits
            ? { salaryRange: info.salaryRange.trim() || null }
            : {}),
        });
        // Location or work arrangement changed after the Brief started from the
        // JD: the Brief's conditions follow once it is written.
        const fields = [
          ...("locationText" in edits &&
          edits.locationText !== saved.locationText
            ? ["location"]
            : []),
          ...("workMode" in edits && edits.workMode !== saved.workMode
            ? ["workMode"]
            : []),
        ];
        if (fields.length && props.session) props.onRoleInfoChanged(fields);
        if (props.role.roleId) await props.refresh();
      }
      if (props.role.roleId) setEdits({});
      return roleId;
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : c(
                "역할 정보를 저장하지 못했어요.",
                "Could not save the role info."
              ),
        variant: "error",
      });
      return null;
    }
  };

  const send = async () => {
    const message = request.trim();
    if (!message || busy) return;
    setSubmitting(true);
    try {
      const roleId = await save();
      if (!roleId) return;
      await chat.sendMessage({
        message,
        draftRoleId: roleId,
        roleCreationView: "role_details",
        onComplete: () => {
          setRequest("");
          if (!props.role.roleId) props.onDraftSaved(roleId);
        },
      });
      if (props.role.roleId) await props.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const next = async () => {
    if (busy) return;
    const people = referenceRowsToSend(references);
    if (!people) {
      addToast({
        message: c(
          "참고 인물의 링크를 넣어 주세요.",
          "Add a link for each reference person."
        ),
        variant: "error",
      });
      return;
    }
    setSubmitting(true);
    try {
      const roleId = await save();
      if (!roleId) return;
      if (!props.session) {
        const started = await props.onStart(roleId);
        if (!started) return;
      }
      if (people.length) {
        if (!props.role.roleId) {
          await fetchWithInternalAuth("/api/org/role-start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add_references",
              roleId,
              workspaceId: props.workspaceId,
              people,
            }),
          });
        } else if (!(await props.onAddReferences(people))) return;
        setReferences([]);
      }
      writeFlag(`role-start-setup:${roleId}`, true);
      if (props.role.roleId) props.onNext();
      else props.onCreated?.(roleId);
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : c("요청을 처리하지 못했어요.", "Request failed."),
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SplitStep>
      <SplitPane side="left">
        <RoleStartStepHeader
          title={
            props.role.roleId
              ? c("역할 정보를 확인해 주세요", "Check the role details")
              : c("어떤 역할을 채용하시나요?", "What role are you hiring for?")
          }
        />
        {reply ? (
          <RichText
            className="text-[14px] text-neutral-primary"
            content={reply}
          />
        ) : null}
        <Textarea
          isMain
          aria-label={c("역할 정보 수정 요청", "Request role changes")}
          autoResize
          disabled={busy}
          onChange={(event) => setRequest(event.target.value)}
          placeholder={
            props.hasDescription
              ? c("수정할 내용을 적어 주세요", "Describe the changes you want")
              : c(
                  "채용 공고나 찾는 역할을 알려 주세요",
                  "Paste a job description or describe the role"
                )
          }
          rows={3}
          value={request}
        />
        {chat.error ? (
          <p className="text-[13px] text-critical" role="alert">
            {chat.error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-[13px] text-neutral-muted">
            {phase === null ? null : phase === "drafting" &&
              props.session?.stalled ? (
              // The draft stopped answering: the same retry as the other stalled steps.
              <div className="flex flex-wrap items-center gap-2 text-[14px] text-neutral-muted">
                {c(
                  "Brief 초안이 멈춘 것 같아요.",
                  "The Brief draft seems to have stopped."
                )}
                <MuteButton
                  disabled={busy}
                  onClick={props.onRetry}
                  variant="transparent"
                >
                  {c("다시 시도", "Try again")}
                </MuteButton>
              </div>
            ) : phase === "drafting" ? (
              <LoadingLine
                hint={c("보통 20초쯤 걸려요", "Usually takes about 20 seconds")}
                text={c(
                  "JD를 읽고 Brief 초안을 쓰고 있어요",
                  "Reading the JD and drafting the Brief"
                )}
              />
            ) : phase === "failed" ? (
              <div className="flex flex-wrap items-center gap-2 text-[14px] text-neutral-muted">
                {c("Brief 초안을 쓰지 못했어요.", "Could not draft the Brief.")}
                <MuteButton
                  disabled={busy}
                  onClick={props.onRetry}
                  variant="transparent"
                >
                  {c("다시 시도", "Try again")}
                </MuteButton>
              </div>
            ) : (
              <DoneLine
                text={c("Brief 초안이 준비됐어요", "The Brief draft is ready")}
              />
            )}
          </div>
          <MuteButton
            className="shrink-0"
            disabled={
              busy ||
              (!hasRequest &&
                (phase === "failed" ||
                  Object.values(invalid).some(Boolean) ||
                  (!phase && !info.description.trim())))
            }
            onClick={() => void (hasRequest ? send() : next())}
            size="lg"
            variant="primary"
          >
            {submitting || chat.isStreaming ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            {hasRequest
              ? props.hasDescription
                ? c("수정하기", "Apply changes")
                : c("입력하기", "Submit")
              : c("이대로 사용하기", "Use these details")}
            {!hasRequest && <ArrowRight className="size-4" />}
          </MuteButton>
        </div>
      </SplitPane>
      <SplitPane side="right">
        <div className="grid gap-8">
          <div className="grid grid-cols-2 items-start gap-x-4 gap-y-5">
            <Field label={c("역할명", "Role title")}>
              <Input
                aria-invalid={invalid.name || undefined}
                required
                className={cn(
                  invalid.name && "border-critical focus:border-critical"
                )}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...info, name: event.target.value })
                }
                placeholder={c("예: 백엔드 엔지니어", "e.g. Backend Engineer")}
                value={info.name}
              />
            </Field>
            <Field label={c("근무 지역", "Location")}>
              <Input
                aria-invalid={invalid.locationText || undefined}
                required
                className={cn(
                  invalid.locationText &&
                    "border-critical focus:border-critical"
                )}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...info, locationText: event.target.value })
                }
                placeholder={c("예: 서울 강남", "e.g. Seoul")}
                value={info.locationText}
              />
            </Field>
            <Field group label={c("근무 형태", "Work arrangement")}>
              <div
                aria-invalid={invalid.workMode || undefined}
                className={cn(
                  "flex flex-wrap gap-1.5",
                  invalid.workMode && "[&_button]:border-critical"
                )}
              >
                {ORG_ROLE_WORK_MODE_VALUES.map((mode) => (
                  <RoleToggleButton
                    active={info.workMode === mode}
                    disabled={busy}
                    key={mode}
                    onClick={() =>
                      setDraft({
                        ...info,
                        workMode: info.workMode === mode ? null : mode,
                      })
                    }
                  >
                    {c(...WORK_MODE_LABEL[mode]!)}
                  </RoleToggleButton>
                ))}
              </div>
            </Field>
            <Field group label={c("고용 형태", "Employment type")}>
              <div
                aria-invalid={invalid.employmentTypes || undefined}
                className={cn(
                  "flex flex-wrap gap-1.5",
                  invalid.employmentTypes && "[&_button]:border-critical"
                )}
              >
                {ORG_ROLE_EMPLOYMENT_TYPE_VALUES.map((type) => {
                  const active = info.employmentTypes.includes(type);
                  return (
                    <RoleToggleButton
                      active={active}
                      disabled={busy}
                      key={type}
                      onClick={() =>
                        setDraft({
                          ...info,
                          employmentTypes: active
                            ? info.employmentTypes.filter(
                                (item) => item !== type
                              )
                            : [...info.employmentTypes, type],
                        })
                      }
                    >
                      {c(...EMPLOYMENT_LABEL[type]!)}
                    </RoleToggleButton>
                  );
                })}
              </div>
            </Field>
          </div>

          <DocumentEditor
            {...documentEditorCopy}
            aria-label={c("Description 수정", "Edit description")}
            disabled={busy}
            documentTitle="Description"
            format="markdown"
            lastChangedAt={props.role.updatedAt}
            onValueChange={(description) => setDraft({ ...info, description })}
            placeholder={c(
              "후보자에게 보여줄 역할 설명을 작성해 주세요.",
              "Write the role description candidates will see."
            )}
            rows={7}
            savedValue={saved.description}
            value={info.description}
          />
          <RoleReferenceInput
            busy={busy}
            drafts={references}
            onDraftsChange={setReferences}
            onRemove={props.onRemoveReference}
            recorded={props.session?.brief.references ?? []}
          />
        </div>
      </SplitPane>
    </SplitStep>
  );
}

// ---------------------------------------------------------------- questions

/** Shared presentation for compensation, Brief questions, and answer history. */
function BriefQuestion(props: {
  busy: boolean;
  question: string;
  why?: string;
  text: string;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onBack?: () => void;
  choices: Array<{ id: string; label: string; onSelect: () => void }>;
  answer?: ReactNode;
}) {
  const { c } = useOrgLocale();
  const reviewing = props.answer !== undefined;
  const hasAnswer = reviewing || Boolean(props.text.trim());
  return (
    <Centered className="my-auto shrink-0 gap-6">
      <RoleStartStepHeader title={props.question} description={props.why} />
      {reviewing ? (
        props.answer
      ) : (
        <>
          <Textarea
            isMain
            autoResize
            rows={3}
            className="min-h-[96px]"
            aria-label={c("직접 답하기", "Answer in your own words")}
            disabled={props.busy}
            value={props.text}
            onChange={(event) => props.onTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                props.text.trim() &&
                !props.busy
              ) {
                event.preventDefault();
                props.onSubmit();
              }
            }}
            placeholder={c(
              "직접 적거나 아래에서 골라 주세요",
              "Type your answer or pick one below"
            )}
          />
          <div className="flex flex-wrap gap-2">
            {props.choices.map((choice) => (
              <MuteButton
                key={choice.id}
                disabled={props.busy}
                onClick={choice.onSelect}
              >
                {choice.label}
              </MuteButton>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div>
          {props.onBack ? (
            <MuteButton
              aria-label={c("이전", "Back")}
              disabled={props.busy}
              onClick={props.onBack}
              size="lg"
            >
              <ArrowLeft className="size-4" />
            </MuteButton>
          ) : null}
        </div>
        <MuteButton
          className="min-w-28"
          disabled={props.busy}
          onClick={hasAnswer ? props.onSubmit : props.onSkip}
          size="lg"
          variant={hasAnswer ? "primary" : "neutral"}
        >
          {hasAnswer ? c("다음", "Next") : c("건너뛰기", "Skip")}
          {hasAnswer ? <ArrowRight aria-hidden className="size-4" /> : null}
        </MuteButton>
      </div>
    </Centered>
  );
}

/** Compensation is stored in the Role's compensation field, separately from the Brief. */
function CompensationQuestion(props: {
  busy: boolean;
  chips: Array<{ ko: string; en: string }>;
  onAnswer: (body: { text?: string; skip?: boolean }) => void;
}) {
  const { c, locale } = useOrgLocale();
  const [text, setText] = useState("");
  return (
    <BriefQuestion
      busy={props.busy}
      question={c(
        "연봉은 어느 정도로 생각하시나요?",
        "What total compensation can you offer for this hire?"
      )}
      why={c(
        "연봉 정보를 최대한 자세히 입력할수록 기준에 맞는 후보자를 연결할 수 있어요. 외부에 공개됩니다.",
        "The more detailed your compensation information, the more likely you'll find candidates who match your criteria."
      )}
      text={text}
      onTextChange={setText}
      onSubmit={() => props.onAnswer({ text: text.trim() })}
      onSkip={() => props.onAnswer({ skip: true })}
      choices={props.chips.map((chip) => ({
        id: chip.ko,
        label: locale === "ko" ? chip.ko.replace(/^연봉 /, "") : chip.en,
        onSelect: () =>
          props.onAnswer({ text: locale === "ko" ? chip.ko : chip.en }),
      }))}
    />
  );
}

function QuestionStep(props: {
  busy: boolean;
  reviewHistory: boolean;
  salaryRange: string | null;
  onReturnToReview: () => void;
  session: RoleStartView;
  onAnswer: (body: { chipId?: string; text?: string; skip?: boolean }) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const { c } = useOrgLocale();
  const history = props.session.questions.history;
  const pending = props.session.pendingQuestion;
  const [viewing, setViewing] = useState<number | null>(() =>
    props.reviewHistory ? history.length - 1 : null
  );
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    if (!props.reviewHistory) setViewing(null);
  }, [pending?.id, props.reviewHistory]);
  const shown = viewing === null ? pending : (history[viewing] ?? null);
  const goBack = () => {
    if (viewing === null) {
      if (history.length) setViewing(history.length - 1);
      else if (props.session.questions.compensation) setViewing(-1);
      else props.onBack();
    } else if (
      viewing > 0 ||
      (viewing === 0 && props.session.questions.compensation)
    )
      setViewing(viewing - 1);
    else props.onBack();
  };
  const goForward = () => {
    if (viewing === null) {
      if (pending) props.onAnswer({ skip: true });
    } else if (viewing + 1 < history.length) setViewing(viewing + 1);
    else if (props.reviewHistory) props.onReturnToReview();
    else setViewing(null);
  };

  if (viewing === -1 && props.session.questions.compensation) {
    return (
      <BriefQuestion
        busy={props.busy}
        question={c(
          "연봉은 어느 정도로 생각하시나요?",
          "What total compensation can you offer for this hire?"
        )}
        text=""
        onTextChange={() => {}}
        onSubmit={goForward}
        onSkip={goForward}
        onBack={goBack}
        choices={[]}
        answer={
          <p className="text-sm text-neutral-muted">
            {props.session.questions.compensation === "skipped"
              ? c("건너뛰었어요", "Skipped")
              : props.salaryRange}
          </p>
        }
      />
    );
  }

  if (!shown) {
    return (
      <Centered className="my-auto shrink-0 gap-6">
        <LoadingLine
          hint={
            props.session.phase === "drafting"
              ? c(
                  "곧 궁금한 점 몇 가지를 여쭤볼게요 · 보통 20초쯤 걸려요",
                  "A few questions are coming · usually about 20 seconds"
                )
              : undefined
          }
          text={
            props.session.phase === "drafting"
              ? c(
                  "JD를 읽으며 이 역할을 더 알아가고 있어요",
                  "Getting to know this role from the JD"
                )
              : c(
                  "답을 반영하고 다음 질문을 고르고 있어요",
                  "Applying your answer and choosing the next question"
                )
          }
        />
        <div aria-hidden className="grid gap-4 pt-2">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-2 h-24 w-full" />
          <div className="flex flex-wrap gap-2">
            {[96, 120, 88, 132].map((width) => (
              <Skeleton className="h-8" key={width} style={{ width }} />
            ))}
          </div>
        </div>
        {/* {props.session.phase === "questions" ? (
          <MuteButton
            className="self-start"
            disabled={props.busy}
            onClick={props.onFinish}
            variant="transparent"
          >
            {c(
              "질문 그만하고 Brief 보기",
              "Stop questions and review the Brief"
            )}
          </MuteButton>
        ) : null} */}
      </Centered>
    );
  }

  const answeredChip =
    viewing === null
      ? null
      : shown.chips.find((chip) => chip.id === shown.answer?.chipId);
  return (
    <BriefQuestion
      busy={props.busy}
      question={shown.question}
      why={shown.why ?? undefined}
      text={text}
      onTextChange={setText}
      onBack={goBack}
      onSkip={goForward}
      onSubmit={() => {
        if (viewing === null) props.onAnswer({ text: text.trim() });
        else goForward();
      }}
      choices={shown.chips.map((chip) => ({
        id: chip.id,
        label: chip.label,
        onSelect: () => props.onAnswer({ chipId: chip.id }),
      }))}
      answer={
        viewing === null ? undefined : (
          <div className="rounded-md bg-bg-weak px-4 py-3 text-[14px] leading-6 text-neutral-primary">
            {shown.status === "skipped"
              ? c("건너뛰었어요", "Skipped")
              : (answeredChip?.label ?? shown.answer?.text)}
            {shown.answer?.applied ? (
              <p className="mt-1 text-[12px] text-neutral-muted">
                {shown.answer.applied}
              </p>
            ) : null}
          </div>
        )
      }
    />
  );
}

// ---------------------------------------------------------------- Brief
/** Left: what Harper did, a change box and confirm. Right: the Brief itself. */
function BriefStep(props: {
  busy: boolean;
  /** The last answer is still being applied: editing and confirming wait for it. */
  refining: boolean;
  issues: Issue[];
  session: RoleStartView;
  onSave: (brief: RoleStartBriefView) => Promise<MutationResult | null>;
  onBack: () => void;
  onRequest: (request: string) => Promise<boolean>;
  onConfirm: () => void;
}) {
  const { c } = useOrgLocale();
  const documentEditorCopy = useOrgDocumentEditorCopy();
  const serverBrief = JSON.stringify(props.session.brief);
  const [draft, setDraft] = useState<RoleStartBriefView>(props.session.brief);
  const [request, setRequest] = useState("");
  const hasRequest = Boolean(request.trim());
  useEffect(() => setDraft(JSON.parse(serverBrief)), [serverBrief]);
  const dirty = JSON.stringify(draft) !== serverBrief;
  const conflicts = props.issues.filter((issue) => issue.level === "conflict");
  const invalid = draft.criteria.some((item) => !item.name.trim() || !item.criteria.trim());
  const answered = props.session.questions.history.filter(
    (item) => item.status !== "skipped"
  ).length;
  // Edits and confirming would race the answer being applied; reading, going back and writing a request do not.
  const locked = props.busy || props.refining;

  return (
    <SplitStep>
      <SplitPane side="left">
        {props.session.progress.some(
          (item) => item.step === "first_three" && item.status === "error"
        ) ? (
          // The first-three search failed and came back here: say why before the team confirms again.
          <p className="text-[13px] leading-5 text-critical">
            {props.session.progress.find(
              (item) => item.step === "first_three" && item.status === "error"
            )?.text ??
              c(
                "첫 3명을 찾지 못했어요.",
                "Could not find the first three."
              )}{" "}
            {c(
              "Brief를 고친 뒤 다시 진행해 주세요.",
              "Adjust the Brief and continue again."
            )}
          </p>
        ) : null}
        <RoleStartStepHeader
          title={c("채용 기준을 작성해봤어요.", "Check the hiring criteria")}
          description={
            answered
              ? c(
                  "답해 주신 내용을 반영해 채용 기준을 정리했어요. 바꿀 점이 있으면 직접 수정하시거나, 저에게 알려주세요.",
                  "Harper wrote the Brief with your answers. Tell Harper what to change, or edit the Brief yourself."
                )
              : c(
                  "JD를 바탕으로 채용 기준을 정리했어요. 바꿀 점이 있으면 직접 수정하시거나, 저에게 알려주세요.",
                  "Harper wrote the Brief from the JD. Tell Harper what to change, or edit the Brief yourself."
                )
          }
        />
        {/* What blocks confirming stays apart and red. */}
        {conflicts.length ? (
          <div
            aria-label={c("고쳐야 할 점", "Must fix")}
            className="grid gap-2"
            role="alert"
          >
            {conflicts.map((issue, index) => (
              <div
                className="rounded-md bg-critical-faded px-4 py-3 text-[13px] leading-5 text-critical"
                key={`${index}:${issue.text}`}
              >
                {issue.text}
              </div>
            ))}
          </div>
        ) : null}
        <Textarea
          isMain
          aria-label={c("바꿀 점 알려 주기", "Tell Harper what to change")}
          autoResize
          className="min-h-[88px]"
          disabled={props.busy}
          onChange={(event) => setRequest(event.target.value)}
          placeholder={c(
            "예: B2B 경험은 필수가 아니에요.",
            "e.g. B2B experience isn't required."
          )}
          rows={3}
          value={request}
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <MuteButton
            disabled={props.busy || (dirty && invalid)}
            onClick={async () => {
              if (dirty && !(await props.onSave(draft))) return;
              props.onBack();
            }}
            size="lg"
            variant="transparent"
          >
            <ArrowLeft className="size-4" />
            {c("이전", "Back")}
          </MuteButton>
          <MuteButton
            disabled={
              locked ||
              ((dirty || !hasRequest) && invalid) ||
              (!hasRequest && !dirty && conflicts.length > 0)
            }
            onClick={async () => {
              if (dirty) {
                const result = await props.onSave(draft);
                if (
                  !result ||
                  (!hasRequest &&
                    result.issues?.some((issue) => issue.level === "conflict"))
                )
                  return;
              }
              if (hasRequest) {
                // Preserve the request on failure and review the result before continuing.
                if (await props.onRequest(request.trim())) setRequest("");
                return;
              }
              props.onConfirm();
            }}
            size="lg"
            variant="primary"
          >
            {hasRequest
              ? locked
                ? c("반영하는 중", "Applying")
                : c("반영하기", "Apply")
              : c("이 기준으로 진행하기", "Use this Brief")}
            <ArrowRight className="size-4" />
          </MuteButton>
        </div>
        {props.session.refining ? (
          <LoadingLine
            text={c(
              "마지막 답을 Brief에 반영하고 있어요",
              "Applying your last answer to the Brief"
            )}
          />
        ) : null}
      </SplitPane>

      <SplitPane side="right">
        <DocumentEditor
          {...documentEditorCopy}
          aria-label={c("찾는 인재상", "Who we're looking for")}
          disabled={locked}
          documentTitle={c("찾는 인재상", "Who we're looking for")}
          format="markdown"
          onValueChange={(summary) =>
            setDraft((current) => ({ ...current, summary }))
          }
          rows={7}
          savedValue={props.session.brief.summary}
          value={draft.summary}
        />
        <RoleBriefFields
          busy={locked}
          dirty={dirty}
          draft={draft}
          hideRequest
          onRequest={props.onRequest}
          setDraft={setDraft}
        />
      </SplitPane>
    </SplitStep>
  );
}

// ---------------------------------------------------------------- first three

/** Left: which person and the rating. Right: the person. */
function AlignStep(props: {
  busy: boolean;
  profiles: Record<string, FirstThreeProfile>;
  session: RoleStartView;
  onEvaluate: (body: RoleStartEvaluateBody) => unknown;
  onNext: () => void;
  onReopen: () => void;
  onWiden: (conditionId: string) => void;
}) {
  const { c } = useOrgLocale();
  const { session } = props;
  const candidates = session.firstCandidates;
  const searching = session.phase === "searching";
  // The position belongs to one list: a new list (a widened condition) starts from the first person.
  const people = candidates.map((item) => item.talentId).join(",");
  const [position, setPosition] = useState({ people, index: 0 });
  const index = position.people === people ? position.index : 0;
  const setIndex = (next: number) => setPosition({ people, index: next });
  const at = Math.min(index, Math.max(0, candidates.length - 1));
  const candidate = candidates[at];
  const total = candidates.length || 3;
  const last = at >= candidates.length - 1;
  // The right panel is still reading this person: moving away waits for it
  // (not for a read that has stopped answering).
  const reading = Boolean(
    candidate &&
    !candidate.verdict &&
    !candidate.failed &&
    !session.readsStalled
  );

  return (
    <SplitStep>
      <SplitPane side="left">
        {!searching && !candidate ? (
          // The search finished with no one: say so and offer the way back to the Brief.
          <div className="grid gap-3">
            <p className="text-[14px] leading-6 text-neutral-primary">
              {c(
                "지금 Brief에 맞는 분을 찾지 못했어요. 필수 조건을 조금 넓혀 다시 찾아 볼까요?",
                "No one fits the Brief right now. Loosen a required condition and search again?"
              )}
            </p>
            <MuteButton
              className="self-start"
              disabled={props.busy}
              onClick={props.onReopen}
              variant="dark"
            >
              <ArrowLeft className="size-4" />
              {c("이전", "Back")}
            </MuteButton>
          </div>
        ) : searching || !candidate ? (
          <LoadingLine
            hint={c("보통 30초쯤 걸려요", "Usually takes about 30 seconds")}
            text={c(
              "Brief에 맞는 첫 3명을 찾고 있어요",
              "Finding the first three for the Brief"
            )}
          />
        ) : (
          <>
            <span className="text-[13px] text-neutral-muted">
              {c("후보 {p0} / {p1}", "Candidate {p0} of {p1}", {
                p0: at + 1,
                p1: total,
              })}
            </span>
            <RoleStartStepHeader
              title={c("이 후보는 어떤가요?", "How does this person look?")}
            />
            <CandidateRating
              busy={props.busy}
              candidate={candidate}
              editable={session.phase === "evaluating"}
              evaluation={session.evaluations[candidate.talentId]}
              key={candidate.talentId}
              onEvaluate={props.onEvaluate}
              onBack={() => (at === 0 ? props.onReopen() : setIndex(at - 1))}
              submitDisabled={reading}
              onSubmitted={() => {
                if (!last) {
                  setIndex(at + 1);
                  return;
                }
                const missing = candidates.findIndex(
                  (item) =>
                    item.talentId !== candidate.talentId &&
                    !session.evaluations[item.talentId]
                );
                if (missing >= 0) setIndex(missing);
                else props.onNext();
              }}
            />
          </>
        )}
        {session.notice?.thin && !searching ? (
          <div className="rounded-md bg-info-faded px-4 py-3 text-[13px] leading-5">
            <p>
              {c(
                "지금 조건에 맞는 분이 많지 않아요. 조건을 조금 넓혀 볼까요?",
                "Few people meet the conditions now. Shall we widen one a little?"
              )}
            </p>
            {session.notice.conditions.length ? (
              <ul className="mt-2 grid gap-2">
                {session.notice.conditions.map((condition) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2"
                    key={condition.id}
                  >
                    <span>
                      {`'${condition.label}': `}
                      {condition.band === "big"
                        ? c(
                            "풀면 후보가 크게 늘어요",
                            "Widening adds many candidates"
                          )
                        : c(
                            "풀면 후보가 조금 늘어요",
                            "Widening adds a few candidates"
                          )}
                    </span>
                    <MuteButton
                      disabled={
                        props.busy ||
                        Object.keys(session.evaluations).length > 0
                      }
                      onClick={() => props.onWiden(condition.id)}
                      size="sm"
                      variant="transparent"
                    >
                      {condition.widen}
                    </MuteButton>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </SplitPane>

      <SplitPane key={candidate?.talentId ?? "searching"} side="right">
        {!searching && !candidate ? null : searching || !candidate ? (
          <div aria-hidden className="grid gap-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-3 h-4 w-3/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <>
            <RoleStartCandidateProfile
              candidate={candidate}
              profile={props.profiles[candidate.talentId]}
            />
            {!candidate.verdict && !candidate.failed && session.readsStalled ? (
              <p className="mt-6 text-[13px] leading-5 text-neutral-muted">
                {c(
                  "이 후보 정리가 멈췄어요. 프로필을 보고 평가해 주셔도 돼요.",
                  "This read stopped. You can still rate the person from the profile."
                )}
              </p>
            ) : !candidate.verdict && !candidate.failed ? (
              <div className="mt-6">
                <LoadingLine
                  text={c("정보를 가져오고 있습니다", "Getting information")}
                />
              </div>
            ) : candidate.failed ? (
              <p className="mt-2 text-[12px] text-neutral-soft">
                {c(
                  "이 후보의 정리를 마치지 못했어요.",
                  "Could not finish this candidate's summary."
                )}
              </p>
            ) : null}
          </>
        )}
      </SplitPane>
    </SplitStep>
  );
}

// ---------------------------------------------------------------- finish

const DAY_LABEL: Record<string, [string, string]> = {
  Mon: ["월", "Mon"],
  Tue: ["화", "Tue"],
  Wed: ["수", "Wed"],
  Thu: ["목", "Thu"],
  Fri: ["금", "Fri"],
  Sat: ["토", "Sat"],
  Sun: ["일", "Sun"],
};

/**
 * People recommended per Role in one regular search (the worker's
 * company_first.scheduled_role_limit). Shown, not chosen here.
 */
const SCHEDULED_ROLE_LIMIT = 3;

const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);

function hourLabel(c: ReturnType<typeof useOrgLocale>["c"], hour: number) {
  return c("{p0} {p1}시", "{p2}", {
    p0: hour < 12 ? "오전" : "오후",
    p1: hour % 12 || 12,
    p2: `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`,
  });
}

/** One choice inside the sentence: the current value, tap to change. */
function SentenceChip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <DropdownMenuTrigger asChild>
      <MuteButton
        aria-label={label}
        className="mx-0.5 bg-neutral-100 align-baseline"
        size="sm"
      >
        {children}
        <ChevronDown aria-hidden className="size-3" />
      </MuteButton>
    </DropdownMenuTrigger>
  );
}

/**
 * How the Role runs after registration, as one sentence with choices: search
 * days and time, where new people are sent (Slack channels and/or email), and
 * the owner copied on intro emails. Registering saves them, then turns the Role on.
 */
function FinalizeStep(props: {
  busy: boolean;
  role: OrgRole;
  session: RoleStartView;
  workspaceId: string;
  onRegister: (notification: {
    channelIds?: string[];
    emailEnabled?: boolean;
    assigneeUserId?: string;
  }) => Promise<void>;
  onBack: () => void;
}) {
  const { c, locale } = useOrgLocale();
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const { bootstrap, user } = useOrgWorkspace();
  const updateRole = useUpdateOrgRole();
  const connectSlack = useConnectOrgSlack();
  const settingsQuery = useOrgRoleNotificationSettings({
    roleId: props.role.roleId,
    workspaceId: props.workspaceId,
  });
  const slackStatusQuery = useOrgSlackStatus({
    workspaceId: props.workspaceId,
  });
  const registering =
    props.session.phase === "registering" || props.session.phase === "batch";
  const registrationError = props.session.progress.find(
    (item) => item.step === "batch" && item.status === "error"
  );

  const savedDays = (
    props.role.introSearchDate ?? DEFAULT_INTRO_SEARCH_DAYS
  ).filter((day) => INTRO_SEARCH_DAYS.includes(day));
  const savedHour = props.role.introSearchTime ?? DEFAULT_INTRO_SEARCH_HOUR;
  const [days, setDays] = useState<IntroSearchDay[] | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const shownDays = days ?? savedDays;
  const shownHour = hour ?? savedHour;

  const channels = settingsQuery.data?.channels ?? [];
  const defaultChannels = channels
    .filter((channel) => channel.enabled)
    .map((channel) => channel.channelId);
  const [channelIds, setChannelIds] = useState<string[] | null>(null);
  const shownChannels =
    channelIds ??
    (defaultChannels.length
      ? defaultChannels
      : channels.length > 0
        ? [channels[0]!.channelId]
        : []);
  const slackConnected =
    slackStatusQuery.data?.connected ?? channels.length > 0;
  // Email: on when the role already has it, otherwise only when there is no channel to choose.
  const [mailOn, setMailOn] = useState<boolean | null>(null);
  const shownMail =
    mailOn ??
    (settingsQuery.data?.emailEnabled === true || channels.length === 0);

  // Same default as role creation: the saved owner, otherwise whoever registers.
  const members = bootstrap.members.filter((member) => member.email);
  const savedOwner = settingsQuery.data?.assigneeUserIds.at(-1) ?? null;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const shownOwner = ownerId ?? savedOwner ?? user.id;
  const ownerName =
    members.find((member) => member.userId === shownOwner)?.name ||
    c("담당자", "the owner");

  const dayText = shownDays
    .map((day) => c(...DAY_LABEL[day]!))
    .join(c("·", ", "));
  const channelText = [
    ...shownChannels
      .map(
        (id) =>
          channels.find((channel) => channel.channelId === id)?.channelName ??
          id
      )
      .map((name) => (name.startsWith("#") ? name : `#${name}`)),
    ...(shownMail ? [c("메일", "email")] : []),
  ].join(", ");
  const nothingChosen = !shownChannels.length && !shownMail;

  const register = async () => {
    if (!settingsQuery.isSuccess || !slackStatusQuery.isSuccess) return;
    if (days || hour !== null) {
      try {
        await updateRole.mutateAsync({
          roleId: props.role.roleId,
          workspaceId: props.workspaceId,
          introSearchDate: shownDays,
          introSearchTime: shownHour,
        });
      } catch (error) {
        addToast({
          message:
            error instanceof Error
              ? error.message
              : c(
                  "검색 일정을 저장하지 못했어요.",
                  "Could not save the search schedule."
                ),
          variant: "error",
        });
        return;
      }
    }
    await props.onRegister({
      // With channels to choose from, none chosen means email only: those channels are turned off.
      channelIds: shownChannels,
      emailEnabled: shownMail,
      assigneeUserId: shownOwner,
    });
  };

  if (registering) {
    return (
      <Centered className="gap-6">
        <RoleStartStepHeader
          title={c("평가를 반영하고 있어요", "Applying your ratings")}
        />
        <LoadingLine
          hint={c("보통 1분 안에 끝나요", "Usually takes 1–2 minutes")}
          text={c(
            "평가를 Brief에 반영하고 있어요",
            "Applying your ratings to the Brief"
          )}
        />
      </Centered>
    );
  }

  const dayChip = (
    <DropdownMenu>
      <SentenceChip label={c("검색 요일", "Search days")}>
        {dayText}
      </SentenceChip>
      <DropdownMenuContent align="start" className="w-36">
        {INTRO_SEARCH_DAYS.map((day) => {
          const on = shownDays.includes(day);
          return (
            <DropdownMenuItem
              key={day}
              onSelect={(event) => {
                event.preventDefault();
                const next = on
                  ? shownDays.filter((item) => item !== day)
                  : [...shownDays, day];
                if (next.length)
                  setDays(
                    INTRO_SEARCH_DAYS.filter((item) => next.includes(item))
                  );
              }}
              selected={on}
              variant="sm"
            >
              {c(...DAY_LABEL[day]!)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const hourChip = (
    <DropdownMenu>
      <SentenceChip label={c("검색 시각", "Search time")}>
        {hourLabel(c, shownHour)}
      </SentenceChip>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-32 overflow-y-auto"
      >
        {HOURS.map((value) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setHour(value)}
            selected={value === shownHour}
            variant="sm"
          >
            {hourLabel(c, value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const channelChip = (
    <DropdownMenu>
      <SentenceChip label={c("알림 받을 곳", "Where updates go")}>
        {channelText || c("받을 곳", "Choose where")}
      </SentenceChip>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto"
      >
        {channels.map((channel) => {
          const on = shownChannels.includes(channel.channelId);
          const name = channel.channelName ?? channel.channelId;
          return (
            <DropdownMenuItem
              key={channel.channelId}
              onSelect={(event) => {
                event.preventDefault();
                setChannelIds(
                  on
                    ? shownChannels.filter((id) => id !== channel.channelId)
                    : [...shownChannels, channel.channelId]
                );
              }}
              selected={on}
              variant="sm"
            >
              {name.startsWith("#") ? name : `#${name}`}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setMailOn(!shownMail);
          }}
          selected={shownMail}
          variant="sm"
        >
          {c("메일", "Email")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const ownerChip = (
    <DropdownMenu>
      <SentenceChip label={c("담당자", "Owner")}>{ownerName}</SentenceChip>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-56 overflow-y-auto"
      >
        {members.map((member) => (
          <DropdownMenuItem
            key={member.userId}
            onSelect={() => setOwnerId(member.userId)}
            selected={member.userId === shownOwner}
            variant="sm"
          >
            {member.name || member.email}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Centered className="gap-8">
      <div>
        <RoleStartStepHeader
          title={c(
            "감사합니다. 이제 준비는 끝났어요. 이 역할의 채용은 이렇게 시작할게요.",
            "Thank you. The onboarding is now complete. The hiring for this role will start like this."
          )}
        >
          <p className="mt-2 text-[18px] leading-[2.4rem] text-neutral-primary">
            {c("매주", "Every")} {dayChip} {hourChip}
            {c(
              "에 새 후보를 찾아 역할당 최대 {p0}명을",
              ", Harper looks for new people and sends up to {p0} per role to",
              {
                p0: SCHEDULED_ROLE_LIMIT,
              }
            )}{" "}
            {channelChip}
            {shownMail
              ? c("로 알려 드릴게요. 담당자는", ". We’ll assign")
              : c("에 알려 드릴게요. 담당자는", ". We’ll assign")}{" "}
            {ownerChip}
            {c("님으로 할게요.", " as the owner.")}
          </p>
        </RoleStartStepHeader>
        {settingsQuery.isError || slackStatusQuery.isError ? (
          <div
            role="alert"
            className="mt-2 flex items-center gap-2 text-[13px] text-critical"
          >
            {c(
              "알림 설정을 불러오지 못했어요.",
              "Could not load notification settings."
            )}
            <MuteButton
              size="sm"
              variant="transparent"
              onClick={() => {
                void settingsQuery.refetch();
                void slackStatusQuery.refetch();
              }}
            >
              {c("다시 시도", "Try again")}
            </MuteButton>
          </div>
        ) : null}
        {nothingChosen ? (
          <p className="mt-2 text-[13px] leading-5 text-critical">
            {c(
              "받을 곳을 하나 이상 골라 주세요.",
              "Choose at least one place for updates."
            )}
          </p>
        ) : null}
        {!slackConnected ? (
          <MuteButton
            className="mt-3"
            disabled={connectSlack.isPending}
            size="sm"
            variant="transparent"
            onClick={async () => {
              try {
                const result = await connectSlack.mutateAsync({
                  returnTo: router.asPath,
                  workspaceId: props.workspaceId,
                });
                window.location.assign(result.authorizeUrl);
              } catch (error) {
                addToast({
                  message:
                    error instanceof Error
                      ? error.message
                      : c(
                          "Slack 연결을 시작하지 못했어요.",
                          "Could not start the Slack connection."
                        ),
                  variant: "error",
                });
              }
            }}
          >
            {c("Slack 연결하기", "Connect Slack")}
            <ArrowRight className="size-3.5" />
          </MuteButton>
        ) : !channels.length ? (
          <MuteButton asChild className="mt-3">
            <Link
              href={buildOrgHref({
                orgId: props.workspaceId,
                page: "settings",
              })}
            >
              {c("Slack 채널 추가하기", "Add a Slack channel")}
              <ArrowRight className="size-4" />
            </Link>
          </MuteButton>
        ) : null}
        {!registering && registrationError ? (
          // A registration that stopped came back here: say so before the team tries again.
          <p role="alert" className="mt-2 text-[13px] leading-5 text-critical">
            {registrationError.billingCode
              ? billingErrorCopy(registrationError.billingCode, locale)
              : c(
                  "지난번 등록을 마치지 못했어요. 다시 눌러 주세요.",
                  "The last registration did not finish. Please try again."
                )}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <MuteButton
          disabled={props.busy}
          onClick={props.onBack}
          size="lg"
          variant="transparent"
        >
          <ArrowLeft className="size-4" />
          {c("이전", "Back")}
        </MuteButton>
        <MuteButton
          disabled={
            props.busy ||
            updateRole.isPending ||
            !settingsQuery.isSuccess ||
            !slackStatusQuery.isSuccess ||
            nothingChosen
          }
          onClick={() => void register()}
          size="lg"
          variant="primary"
        >
          {c("채용 시작하기", "Start hiring")}
        </MuteButton>
      </div>
    </Centered>
  );
}
