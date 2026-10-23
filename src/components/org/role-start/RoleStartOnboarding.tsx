import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ChevronDown, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { registerMissingMessage } from "@/components/org/role-start/OrgRoleStartPanel";
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
import { RoleStartCandidateCard, type FirstThreeProfile } from "@/components/org/role-start/RoleStartCandidateCard";
import {
  ROLE_START_STEPS,
  roleStartStepOf,
  type RoleStartStepId,
} from "@/components/org/role-start/roleStartSteps";
import { RoleToggleButton } from "@/components/org/role-overview/RoleOverviewShared";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import RichText from "@/components/ui/rich-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useUpdateOrgRole } from "@/hooks/org/useOrg";
import { useOrgAgentChat, useOrgAgentMessageHistory } from "@/hooks/org/useOrgAgent";
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
import { roleStartOwnsRole } from "@/lib/org/roleStart/ownership";
import type { RoleStartBriefView, RoleStartView } from "@/lib/org/roleStart/view";
import { buildOrgHref } from "@/lib/org/routes";
import type { OrgRole } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

type Issue = { level: "conflict" | "warning"; text: string };

export type RoleStartResponse = {
  session: RoleStartView | null;
  role: {
    status: string;
    hasDescription: boolean;
    name: string;
    locationText: string | null;
    workMode: string | null;
    employmentTypes: string[];
    salaryRange: string | null;
  };
  issues: Issue[];
  /** Work history and education of the first three while they are rated. */
  profiles?: Record<string, FirstThreeProfile>;
  /** The fixed compensation question, asked first when the JD stated none. */
  compensation?: { chips: Array<{ ko: string; en: string }> } | null;
  versions: Array<{ version: number; createdAt: string; summary: string | null }>;
};

type MutationResult = {
  session?: RoleStartView | null;
  issues?: Issue[];
  applied?: string;
  missingFields?: string[];
};

const ACTIVE_PHASES = new Set<RoleStartView["phase"]>(["drafting", "searching", "registering", "batch"]);

/** The role start state, polled while a step runs; shared with the 시작 tab and the chat. */
export function useRoleStartQuery(roleId: string, workspaceId: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["org-role-start", workspaceId, roleId],
    queryFn: () =>
      fetchWithInternalAuth<RoleStartResponse>(
        `/api/org/role-start?roleId=${encodeURIComponent(roleId)}&workspaceId=${encodeURIComponent(workspaceId)}`
      ),
    refetchInterval: (current) => {
      const session = current.state.data?.session;
      // A new Role gets its session within seconds; a Role that never started the flow stops asking
      // after ~36s, past the new-role page's 30 s loading line.
      if (!session) return current.state.dataUpdateCount < 12 ? 3_000 : false;
      const verdictsPending =
        session.phase === "evaluating" &&
        session.firstCandidates.some((candidate) => !candidate.verdict && !candidate.failed);
      const waitingForQuestion = session.phase === "questions" && !session.pendingQuestion;
      // The Brief screen shows the answer once it is applied behind it.
      const refining = session.phase === "review" && session.refining;
      return ACTIVE_PHASES.has(session.phase) || verdictsPending || waitingForQuestion || refining ? 1_000 : false;
    },
  });
}

/**
 * True while the start flow owns the Role's screen: a draft Role whose start
 * flow can still move forward (roleStartOwnsRole). A draft without a session
 * (made in the chat), or one whose flow failed, stalled or found no one, keeps
 * the regular Role screen; its 시작 tab still offers 다시 시도.
 */
export function isRoleStartOnboarding(role: OrgRole | null, data: RoleStartResponse | undefined) {
  return Boolean(role && String(role.status ?? "").toLowerCase() === "draft" && roleStartOwnsRole(data?.session));
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
export function RoleStartOnboarding({ role, workspaceId }: { role: OrgRole; workspaceId: string }) {
  const { c } = useOrgLocale();
  const { permissions } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const queryClient = useQueryClient();
  const roleId = role.roleId;
  const query = useRoleStartQuery(roleId, workspaceId);
  const queryKey = useMemo(() => ["org-role-start", workspaceId, roleId], [roleId, workspaceId]);
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchWithInternalAuth<MutationResult>("/api/org/role-start", {
        body: JSON.stringify({ ...body, roleId, workspaceId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onError: (cause) => {
      addToast({
        message: cause instanceof Error ? cause.message : c("요청을 처리하지 못했어요.", "Request failed."),
        variant: "error",
      });
      // Changed elsewhere meanwhile (e.g. a Brief edit): show the latest.
      if ((cause as { status?: number }).status === 409) void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });
  const run = (body: Record<string, unknown>) => mutation.mutateAsync(body).catch(() => null);
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

  const session = query.data?.session ?? null;
  const phaseStep = roleStartStepOf(session?.phase ?? null);
  const step: RoleStartStepId =
    phaseStep === "brief" && !setupDone
      ? "setup"
      : phaseStep === "setup" && setupDone && session?.phase === "drafting"
        ? "brief"
        : phaseStep === "align" && finalizeOpen && session?.phase === "evaluating"
          ? "finalize"
          : phaseStep;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg-default">
      <StepBar current={step} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-8 md:px-8 md:pt-12">
        {!session || step === "setup" ? (
          <SetupStep
            busy={busy}
            hasDescription={query.data?.role.hasDescription ?? false}
            onAddReferences={async (people) => {
              const result = await run({ action: "add_references", people });
              if (result) addToast({ message: c("참고 인물을 받았어요. 읽은 뒤 여기에 보여요.", "Got the reference people. They show here once read."), variant: "success" });
              return Boolean(result);
            }}
            onNext={() => {
              writeFlag(setupKey, true);
              setSetupDone(true);
            }}
            onRemoveReference={(referenceId) => void run({ action: "remove_reference", referenceId })}
            onRetry={() => run({ action: session?.stalled ? "retry" : "start" })}
            onRoleInfoChanged={(fields) => void run({ action: "role_info", fields })}
            refresh={() => void queryClient.invalidateQueries({ queryKey })}
            role={query.data?.role ? { ...role, ...query.data.role, status: role.status } : role}
            session={session}
            workspaceId={workspaceId}
          />
        ) : session.stalled ? (
          <Centered>
            <p className="text-[14px] text-neutral-muted">
              {c("진행이 멈춘 것 같아요. 다시 시도할 수 있어요.", "This step seems to have stopped. You can try again.")}
            </p>
            <MuteButton className="mt-3" disabled={busy} onClick={() => run({ action: "retry" })}>
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
          ) : session.phase === "review" ? (
            <BriefStep
              // An answer still being applied: the Brief is read-only until it lands.
              busy={busy || session.refining}
              issues={query.data?.issues ?? []}
              onConfirm={() => run({ action: "confirm" })}
              onPrewarm={() => run({ action: "prewarm" })}
              onRequest={async (request) => {
                const result = await run({ action: "edit", request });
                if (result?.applied) addToast({ message: result.applied, variant: "success" });
                return Boolean(result);
              }}
              onSave={(brief) => run({ action: "edit", brief, briefHash: session.briefHash })}
              session={session}
            />
          ) : (
            <QuestionStep
              busy={busy}
              onAnswer={(body) =>
                session.pendingQuestion && run({ action: "answer", questionId: session.pendingQuestion.id, ...body })
              }
              onBack={() => {
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
            onWiden={(conditionId) => run({ action: "widen_condition", conditionId })}
            profiles={query.data?.profiles ?? {}}
            roleId={roleId}
            session={session}
          />
        ) : (
          <FinalizeStep
            busy={busy}
            onBack={() => setFinalizeOpen(false)}
            onRegister={async (notification) => {
              const result = await run({ action: "register", ...notification });
              if (result?.missingFields?.length) {
                addToast({ message: registerMissingMessage(c, result.missingFields), variant: "error" });
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
    <nav aria-label={c("진행 단계", "Progress")} className="shrink-0 border-b border-neutral-1000-a05 px-4 py-3 md:px-8">
      <ol className="mx-auto flex max-w-[760px] items-center gap-2">
        {ROLE_START_STEPS.map((item, position) => (
          <li className="flex min-w-0 flex-1 flex-col gap-1.5" key={item.id}>
            <span
              aria-hidden
              className={cn("h-1 rounded-full", position <= index ? "bg-neutral-1000" : "bg-neutral-1000-a10")}
            />
            <span
              aria-current={position === index ? "step" : undefined}
              className={cn(
                "truncate text-[12px] leading-4",
                position === index ? "font-medium text-neutral-primary" : "text-neutral-soft"
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

function Centered({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-[640px] flex-col", className)}>{children}</div>;
}

function LoadingLine({ text, hint }: { text: string; hint?: string }) {
  return (
    <div aria-live="polite" className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-[14px] text-neutral-primary">
        <LoaderCircle aria-hidden className="size-4 animate-spin text-neutral-muted" />
        {text}
      </span>
      {hint ? <span className="pl-6 text-[12px] leading-5 text-neutral-soft">{hint}</span> : null}
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
};

function roleInfoOf(role: OrgRole): RoleInfo {
  return {
    name: role.name === "새 역할" ? "" : role.name,
    locationText: role.locationText ?? "",
    workMode: role.workMode,
    employmentTypes: role.employmentTypes,
    salaryRange: role.salaryRange ?? "",
  };
}

/** Role facts read from the JD, to check while Harper drafts the Brief. */
function SetupStep(props: {
  busy: boolean;
  hasDescription: boolean;
  role: OrgRole;
  session: RoleStartView | null;
  workspaceId: string;
  onAddReferences: (people: NonNullable<ReturnType<typeof referenceRowsToSend>>) => Promise<boolean>;
  onNext: () => void;
  onRemoveReference: (referenceId: string) => void;
  onRetry: () => void;
  onRoleInfoChanged: (fields: string[]) => void;
  refresh: () => void;
}) {
  const { c } = useOrgLocale();
  // 참고 인물 rows: sent with 다음 (the Brief has started by then).
  const [references, setReferences] = useState<ReferenceDraft[]>([]);
  const addToast = useToastStore((state) => state.add);
  const updateRole = useUpdateOrgRole();
  const saved = roleInfoOf(props.role);
  // Only the fields the company changed: the rest keep following what Harper
  // reads from the JD, so a late read never overwrites the company's input.
  const [edits, setEdits] = useState<Partial<RoleInfo>>({});
  const info: RoleInfo = { ...saved, ...edits };
  const slackStatus = useOrgSlackStatus({ workspaceId: props.workspaceId });
  // The role facts registration requires (getRoleCreationMissingFields), asked for on this step.
  const missing = [
    ...(info.name.trim() && info.name.trim() !== "새 역할" ? [] : [c("역할 이름", "role title")]),
    ...(info.locationText.trim() ? [] : [c("근무 지역", "work location")]),
    ...(info.workMode ? [] : [c("근무 형태", "work arrangement")]),
    ...(info.employmentTypes.length ? [] : [c("고용 형태", "employment type")]),
  ];
  const setDraft = (next: RoleInfo) =>
    setEdits((current) => {
      const changed: Partial<RoleInfo> = { ...current };
      for (const key of Object.keys(next) as Array<keyof RoleInfo>) {
        if (JSON.stringify(next[key]) !== JSON.stringify(info[key])) (changed as Record<string, unknown>)[key] = next[key];
      }
      return changed;
    });
  const dirty = (Object.keys(edits) as Array<keyof RoleInfo>).some(
    (key) => JSON.stringify(edits[key]) !== JSON.stringify(saved[key])
  );
  const phase = props.session?.phase ?? null;
  const refreshRef = useRef(props.refresh);
  refreshRef.current = props.refresh;
  const missingFacts = !saved.name || !saved.workMode || saved.employmentTypes.length === 0;
  useEffect(() => {
    // Harper saves the role facts partway through reading the JD; read them
    // again until they are in (or for a minute at most).
    if (!missingFacts && phase !== null) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 60_000) window.clearInterval(timer);
      else refreshRef.current();
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [missingFacts, phase]);

  const next = async () => {
    const people = referenceRowsToSend(references);
    if (!people) {
      addToast({ message: c("참고 인물마다 링크나 프로필을 넣어 주세요.", "Add a link or a profile for each reference person."), variant: "error" });
      return;
    }
    if (people.length) {
      if (!(await props.onAddReferences(people))) return;
      setReferences([]);
    }
    if (dirty) {
      try {
        await updateRole.mutateAsync({
          roleId: props.role.roleId,
          workspaceId: props.workspaceId,
          ...("name" in edits && info.name.trim() ? { name: info.name.trim() } : {}),
          ...("locationText" in edits ? { locationText: info.locationText.trim() || null } : {}),
          ...("workMode" in edits ? { workMode: info.workMode } : {}),
          ...("employmentTypes" in edits ? { employmentTypes: info.employmentTypes } : {}),
          ...("salaryRange" in edits ? { salaryRange: info.salaryRange.trim() || null } : {}),
        });
        // Location or work arrangement changed after the Brief started from the
        // JD: the Brief's conditions follow once it is written.
        const fields = [
          ...("locationText" in edits && edits.locationText !== saved.locationText ? ["location"] : []),
          ...("workMode" in edits && edits.workMode !== saved.workMode ? ["workMode"] : []),
        ];
        if (fields.length) props.onRoleInfoChanged(fields);
        props.refresh();
        setEdits({});
      } catch (error) {
        addToast({
          message: error instanceof Error ? error.message : c("역할 정보를 저장하지 못했어요.", "Could not save the role info."),
          variant: "error",
        });
        return;
      }
    }
    props.onNext();
  };

  return (
    <Centered className="gap-8">
      <div>
        <h1 className="text-[22px] font-normal leading-8 tracking-[-0.02em] text-neutral-primary">
          {c("역할 정보를 확인해 주세요", "Check the role details")}
        </h1>
        <p className="mt-1 text-[14px] leading-6 text-neutral-muted">
          {c(
            "JD에서 읽은 내용이에요. 다른 점이 있으면 고쳐 주세요. 그동안 Brief 초안을 쓰고 있어요.",
            "This is what Harper read from the JD. Fix anything that's off while Harper drafts the Brief."
          )}
        </p>
        {phase === null ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LoadingLine text={c("JD를 읽고 있어요", "Reading the JD")} />
            {props.hasDescription ? (
              // The draft normally starts on its own; this starts it for a Role whose draft never began.
              <MuteButton disabled={props.busy} onClick={props.onRetry} size="sm" variant="transparent">
                {c("Brief 초안 만들기", "Draft the Brief")}
              </MuteButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-5">
        <Field label={c("역할 이름", "Role title")}>
          <Input
            disabled={props.busy}
            onChange={(event) => setDraft({ ...info, name: event.target.value })}
            placeholder={c("예: 백엔드 엔지니어", "e.g. Backend Engineer")}
            value={info.name}
          />
        </Field>
        <Field label={c("근무 지역", "Location")}>
          <Input
            disabled={props.busy}
            onChange={(event) => setDraft({ ...info, locationText: event.target.value })}
            placeholder={c("예: 서울 강남", "e.g. Seoul")}
            value={info.locationText}
          />
        </Field>
        <Field label={c("근무 형태", "Work arrangement")}>
          <div className="flex flex-wrap gap-1.5">
            {ORG_ROLE_WORK_MODE_VALUES.map((mode) => (
              <RoleToggleButton
                active={info.workMode === mode}
                disabled={props.busy}
                key={mode}
                onClick={() => setDraft({ ...info, workMode: info.workMode === mode ? null : mode })}
              >
                {c(...WORK_MODE_LABEL[mode]!)}
              </RoleToggleButton>
            ))}
          </div>
        </Field>
        <Field label={c("고용 형태", "Employment type")}>
          <div className="flex flex-wrap gap-1.5">
            {ORG_ROLE_EMPLOYMENT_TYPE_VALUES.map((type) => {
              const active = info.employmentTypes.includes(type);
              return (
                <RoleToggleButton
                  active={active}
                  disabled={props.busy}
                  key={type}
                  onClick={() =>
                    setDraft({
                      ...info,
                      employmentTypes: active
                        ? info.employmentTypes.filter((item) => item !== type)
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

      <RoleReferenceInput
        busy={props.busy}
        drafts={references}
        onDraftsChange={setReferences}
        onRemove={props.onRemoveReference}
        recorded={props.session?.brief.references ?? []}
        workspaceId={props.workspaceId}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-1000-a05 pt-5">
        {phase === null ? (
          // Reading the JD: said at the top of the step.
          <div />
        ) : phase === "drafting" && props.session?.stalled ? (
          // The draft stopped answering: the same retry as the other stalled steps.
          <div className="flex items-center gap-2 text-[14px] text-neutral-muted">
            {c("Brief 초안이 멈춘 것 같아요.", "The Brief draft seems to have stopped.")}
            <MuteButton disabled={props.busy} onClick={props.onRetry} variant="transparent">
              {c("다시 시도", "Try again")}
            </MuteButton>
          </div>
        ) : phase === "drafting" ? (
          <LoadingLine
            hint={c("보통 1분쯤 걸려요", "Usually takes about a minute")}
            text={c("JD를 읽고 Brief 초안을 쓰고 있어요", "Reading the JD and drafting the Brief")}
          />
        ) : phase === "failed" ? (
          <div className="flex items-center gap-2 text-[14px] text-neutral-muted">
            {c("Brief 초안을 쓰지 못했어요.", "Could not draft the Brief.")}
            <MuteButton disabled={props.busy} onClick={props.onRetry} variant="transparent">
              {c("다시 시도", "Try again")}
            </MuteButton>
          </div>
        ) : (
          <DoneLine text={c("Brief 초안이 준비됐어요", "The Brief draft is ready")} />
        )}
        <MuteButton
          disabled={props.busy || updateRole.isPending || phase === null || phase === "failed" || missing.length > 0}
          onClick={() => void next()}
          size="lg"
          variant="primary"
        >
          {c("다음", "Next")}
          <ArrowRight className="size-4" />
        </MuteButton>
      </div>
      {slackStatus.data && !slackStatus.data.connected ? (
        // Registration needs Slack; the last step has the connect button, this only says so early.
        <p className="text-right text-[12px] text-neutral-muted">
          {c("역할을 등록하려면 Slack 연결이 필요해요. 마지막 단계에서 연결할 수 있어요.", "Registering needs Slack. You can connect it at the last step.")}
        </p>
      ) : null}
      {phase !== null && missing.length ? (
        // Registration needs these; asking here keeps the team from being stopped at the last step.
        <p className="text-right text-[12px] text-neutral-muted">
          {c("{p0} 칸을 채우면 다음으로 넘어갈 수 있어요.", "Fill in {p0} to continue.", { p0: missing.join(", ") })}
        </p>
      ) : null}
      {phase === null && !props.hasDescription ? (
        // Without a description there is no Brief to draft yet: Harper's
        // question about the role is answered here, one at a time. Once a
        // description is saved, further questions come as Brief step cards.
        <SetupQuestion roleId={props.role.roleId} workspaceId={props.workspaceId} />
      ) : null}
    </Centered>
  );
}

/** Harper's latest message about a Role with no description yet, and one box to answer it. */
function SetupQuestion({ roleId, workspaceId }: { roleId: string; workspaceId: string }) {
  const { c } = useOrgLocale();
  const { user } = useOrgWorkspace();
  const [text, setText] = useState("");
  const history = useOrgAgentMessageHistory({ mode: "role_creation", roleId, workspaceId });
  const chat = useOrgAgentChat({
    appendMessagesToCache: history.appendMessagesToCache,
    currentUserId: user.id,
    mode: "role_creation",
    roleId,
    workspaceId,
  });
  const messages = history.messages;
  const last = messages[messages.length - 1];
  const question = last?.role === "assistant" && !chat.isStreaming ? last.content.trim() : "";
  const send = async () => {
    const message = text.trim();
    if (!message || chat.isStreaming) return;
    setText("");
    await chat.sendMessage({ message });
  };
  // While Harper is still reading, the step's own progress line says so.
  if (!question) return null;
  return (
    <section aria-label={c("Harper의 질문", "Harper's question")} className="grid gap-3 rounded-lg bg-bg-weak p-4">
      <RichText className="text-[14px] leading-6 text-neutral-primary" content={question} />
      <Textarea
        aria-label={c("답하기", "Answer")}
        autoResize
        className="min-h-[72px]"
        disabled={chat.isStreaming}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder={c("JD를 붙여 넣거나 역할을 설명해 주세요", "Paste the JD or describe the role")}
        rows={3}
        value={text}
      />
      <MuteButton className="justify-self-end" disabled={chat.isStreaming || !text.trim()} onClick={() => void send()} variant="dark">
        {c("보내기", "Send")}
      </MuteButton>
    </section>
  );
}

// ---------------------------------------------------------------- questions

/** One question at a time; the back arrow shows earlier answers, the forward arrow skips. */
/** Asked first when the JD stated no compensation: the answer is the Role's 보상 field, not part of the Brief. */
function CompensationQuestion(props: {
  busy: boolean;
  chips: Array<{ ko: string; en: string }>;
  onAnswer: (body: { text?: string; skip?: boolean }) => void;
}) {
  const { c, locale } = useOrgLocale();
  const [text, setText] = useState("");
  return (
    <Centered className="gap-6">
      <div>
        <h1 className="text-[22px] font-normal leading-8 tracking-[-0.02em] text-neutral-primary">
          {c("이 역할의 연봉은 어느 정도인가요?", "What is the pay for this role?")}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-neutral-muted">
          {c("역할 정보에 보상으로 저장해요. 나중에 바꿀 수 있어요.", "Saved as the role's compensation. You can change it later.")}
        </p>
      </div>
      <Textarea
        aria-label={c("직접 답하기", "Answer in your own words")}
        autoResize
        className="min-h-[72px]"
        disabled={props.busy}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && text.trim()) {
            event.preventDefault();
            props.onAnswer({ text: text.trim() });
          }
        }}
        placeholder={c("직접 적거나 아래에서 골라 주세요", "Type your answer or pick one below")}
        rows={2}
        value={text}
      />
      <div className="flex flex-wrap gap-2">
        {props.chips.map((chip) => (
          <MuteButton disabled={props.busy} key={chip.ko} onClick={() => props.onAnswer({ text: locale === "ko" ? chip.ko : chip.en })}>
            {locale === "ko" ? chip.ko.replace(/^연봉 /, "") : chip.en}
          </MuteButton>
        ))}
        <MuteButton disabled={props.busy} onClick={() => props.onAnswer({ skip: true })}>
          {c("아직 안 정했어요", "Not decided yet")}
        </MuteButton>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <MuteButton disabled={props.busy} onClick={() => props.onAnswer({ skip: true })} variant="transparent">
          {c("건너뛰기", "Skip")}
        </MuteButton>
        <MuteButton
          disabled={props.busy || !text.trim()}
          onClick={() => props.onAnswer({ text: text.trim() })}
          size="lg"
          variant="dark"
        >
          {c("답하기", "Answer")}
        </MuteButton>
      </div>
    </Centered>
  );
}

function QuestionStep(props: {
  busy: boolean;
  session: RoleStartView;
  onAnswer: (body: { chipId?: string; text?: string; skip?: boolean }) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const { c } = useOrgLocale();
  const history = props.session.questions.history;
  const pending = props.session.pendingQuestion;
  const [viewing, setViewing] = useState<number | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    setViewing(null);
  }, [pending?.id]);
  const shown = viewing === null ? pending : history[viewing] ?? null;
  const number = viewing === null ? history.length + 1 : viewing + 1;
  const goBack = () => {
    if (viewing === null) {
      if (history.length) setViewing(history.length - 1);
      else props.onBack();
    } else if (viewing > 0) setViewing(viewing - 1);
    else props.onBack();
  };
  const goForward = () => {
    if (viewing === null) {
      if (pending) props.onAnswer({ skip: true });
    } else setViewing(viewing + 1 < history.length ? viewing + 1 : null);
  };

  if (!shown) {
    return (
      <Centered className="gap-6">
        <LoadingLine
          hint={props.session.phase === "drafting" ? c("보통 1분쯤 걸려요", "Usually takes about a minute") : undefined}
          text={
            props.session.phase === "drafting"
              ? c("JD를 읽고 질문을 준비하고 있어요", "Reading the JD and preparing questions")
              : c("답을 반영하고 다음 질문을 고르고 있어요", "Applying your answer and choosing the next question")
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
        {props.session.phase === "questions" ? (
          <MuteButton className="self-start" disabled={props.busy} onClick={props.onFinish} variant="transparent">
            {c("질문 그만하고 Brief 보기", "Stop questions and review the Brief")}
          </MuteButton>
        ) : null}
      </Centered>
    );
  }

  const answeredChip = viewing === null ? null : shown.chips.find((chip) => chip.id === shown.answer?.chipId);
  return (
    <Centered className="gap-6">
      <span className="text-[12px] text-neutral-soft">{c("질문 {p0}", "Question {p0}", { p0: number })}</span>
      <div>
        <h1 className="text-[22px] font-normal leading-8 tracking-[-0.02em] text-neutral-primary">{shown.question}</h1>
        {shown.why ? <p className="mt-2 text-[14px] leading-6 text-neutral-muted">{shown.why}</p> : null}
      </div>
      {viewing === null ? (
        <>
          <Textarea
            aria-label={c("직접 답하기", "Answer in your own words")}
            autoResize
            className="min-h-[96px]"
            disabled={props.busy}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && text.trim()) {
                event.preventDefault();
                props.onAnswer({ text: text.trim() });
              }
            }}
            placeholder={c("직접 적거나 아래에서 골라 주세요", "Type your answer or pick one below")}
            rows={3}
            value={text}
          />
          <div className="flex flex-wrap gap-2">
            {shown.chips.map((chip) => (
              <MuteButton disabled={props.busy} key={chip.id} onClick={() => props.onAnswer({ chipId: chip.id })}>
                {chip.label}
              </MuteButton>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-md bg-bg-weak px-4 py-3 text-[14px] leading-6 text-neutral-primary">
          {shown.status === "skipped" ? c("건너뛰었어요", "Skipped") : answeredChip?.label ?? shown.answer?.text}
          {shown.answer?.applied ? <p className="mt-1 text-[12px] text-neutral-muted">{shown.answer.applied}</p> : null}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1">
          <MuteButton aria-label={c("이전", "Back")} disabled={props.busy} onClick={goBack} size="lg">
            <ArrowLeft className="size-4" />
          </MuteButton>
          <MuteButton
            aria-label={viewing === null ? c("건너뛰기", "Skip") : c("다음", "Next")}
            disabled={props.busy}
            onClick={goForward}
            size="lg"
          >
            <ArrowRight className="size-4" />
          </MuteButton>
        </div>
        <div className="flex items-center gap-2">
          <MuteButton disabled={props.busy} onClick={props.onFinish} variant="transparent">
            {c("질문 그만하고 Brief 보기", "Stop questions and review the Brief")}
          </MuteButton>
          {viewing === null ? (
            <MuteButton
              disabled={props.busy || !text.trim()}
              onClick={() => props.onAnswer({ text: text.trim() })}
              size="lg"
              variant="dark"
            >
              {props.busy ? c("반영하는 중", "Applying") : c("답하기", "Answer")}
            </MuteButton>
          ) : null}
        </div>
      </div>
    </Centered>
  );
}

// ---------------------------------------------------------------- Brief

/** Left: what Harper did, a change box and confirm. Right: the Brief itself. */
function BriefStep(props: {
  busy: boolean;
  issues: Issue[];
  session: RoleStartView;
  onSave: (brief: RoleStartBriefView) => void;
  onRequest: (request: string) => unknown;
  onConfirm: () => void;
  onPrewarm: () => void;
}) {
  const { c } = useOrgLocale();
  const serverBrief = JSON.stringify(props.session.brief);
  const [draft, setDraft] = useState<RoleStartBriefView>(props.session.brief);
  const [request, setRequest] = useState("");
  useEffect(() => setDraft(JSON.parse(serverBrief)), [serverBrief]);
  const prewarmed = useRef(false);
  const { onPrewarm } = props;
  useEffect(() => {
    if (!prewarmed.current) {
      prewarmed.current = true;
      onPrewarm();
    }
  }, [onPrewarm]);
  const dirty = JSON.stringify(draft) !== serverBrief;
  const conflicts = props.issues.filter((issue) => issue.level === "conflict");
  const warnings = props.issues.filter((issue) => issue.level !== "conflict");
  const invalid = draft.criteria.some((item) => !item.name.trim() || !item.criteria.trim());
  const answered = props.session.questions.history.filter((item) => item.status !== "skipped").length;

  return (
    <div className="mx-auto grid w-full max-w-[1120px] gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5 md:sticky md:top-0 md:self-start">
        {props.session.progress.some((item) => item.step === "first_three" && item.status === "error") ? (
          // The first-three search failed and came back here: say why before the team confirms again.
          <p className="text-[13px] leading-5 text-critical">
            {props.session.progress.find((item) => item.step === "first_three" && item.status === "error")?.text ??
              c("첫 3명을 찾지 못했어요.", "Could not find the first three.")}{" "}
            {c("Brief를 고친 뒤 다시 진행해 주세요.", "Adjust the Brief and continue again.")}
          </p>
        ) : null}
        {/* One Harper note: what was done, then anything worth checking. */}
        <div className="rounded-lg bg-bg-weak px-4 py-3 text-[14px] leading-6 text-neutral-primary">
          <p>
            {answered
              ? c(
                  "답해 주신 내용을 반영해 Brief를 정리했어요. 이 기준으로 첫 3명을 찾아요. 바꿀 점이 있으면 알려 주시거나 Brief를 직접 고쳐도 돼요.",
                  "Harper wrote the Brief with your answers. It finds the first three with it. Tell Harper what to change, or edit the Brief yourself."
                )
              : c(
                  "JD를 바탕으로 Brief를 정리했어요. 이 기준으로 첫 3명을 찾아요. 바꿀 점이 있으면 알려 주시거나 Brief를 직접 고쳐도 돼요.",
                  "Harper wrote the Brief from the JD. It finds the first three with it. Tell Harper what to change, or edit the Brief yourself."
                )}
          </p>
          {warnings.length ? (
            <div aria-label={c("확인할 점", "Things to check")} className="mt-2" role="group">
              <p className="font-medium">{c("확인해 주세요:", "Please check:")}</p>
              <ul className="mt-1 grid gap-1 pl-4 [list-style:disc]">
                {warnings.map((issue, index) => (
                  <li key={`${index}:${issue.text}`}>{issue.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {/* What blocks confirming stays apart and red. */}
        {conflicts.length ? (
          <div aria-label={c("고쳐야 할 점", "Must fix")} className="grid gap-2" role="alert">
            {conflicts.map((issue, index) => (
              <div className="rounded-md bg-critical-faded px-4 py-3 text-[13px] leading-5 text-critical" key={`${index}:${issue.text}`}>
                {issue.text}
              </div>
            ))}
          </div>
        ) : null}
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (request.trim()) {
              // The typed text stays when the change fails, so it can be sent again.
              void Promise.resolve(props.onRequest(request.trim())).then((ok) => {
                if (ok !== false) setRequest("");
              });
            }
          }}
        >
          <Textarea
            aria-label={c("바꿀 점 알려 주기", "Tell Harper what to change")}
            autoResize
            className="min-h-[88px]"
            disabled={props.busy}
            onChange={(event) => setRequest(event.target.value)}
            placeholder={c(
              "바꿀 점을 알려 주세요. 예: B2B 경험은 필수가 아니에요.",
              "Tell Harper what to change, e.g. B2B experience isn't required."
            )}
            rows={3}
            value={request}
          />
          <MuteButton className="justify-self-end" disabled={props.busy || !request.trim() || dirty} type="submit">
            {props.busy ? c("반영하는 중", "Applying") : c("반영하기", "Apply")}
          </MuteButton>
        </form>
        <MuteButton
          className="w-full"
          disabled={props.busy || dirty || conflicts.length > 0}
          onClick={props.onConfirm}
          size="lg"
          variant="primary"
        >
          {c("이 Brief로 진행하기", "Use this Brief")}
        </MuteButton>
        {props.session.refining ? (
          <LoadingLine text={c("마지막 답을 Brief에 반영하고 있어요", "Applying your last answer to the Brief")} />
        ) : null}
      </div>

      <div className="min-w-0">
        <h2 className="text-[13px] font-medium text-neutral-muted">{c("요약", "Summary")}</h2>
        <Textarea
          aria-label={c("Brief 요약", "Brief summary")}
          autoResize
          className="mt-2 min-h-[88px]"
          disabled={props.busy}
          onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          rows={3}
          value={draft.summary}
        />
        <RoleBriefFields busy={props.busy} dirty={dirty} draft={draft} hideRequest onRequest={props.onRequest} setDraft={setDraft} />
      </div>
      {dirty ? (
        <OrgUnsavedChangesBar
          canSave={!invalid}
          hasChanges={dirty}
          onCancel={() => setDraft(JSON.parse(serverBrief))}
          onSave={() => props.onSave(draft)}
          pending={props.busy}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- first three

/** Arrows that cannot be used stay visible, greyed, with a not-allowed cursor. */
const ARROW_DISABLED = "disabled:pointer-events-auto disabled:cursor-not-allowed disabled:hover:bg-bg-floating";

/** Left: which person and the rating. Right: the person. */
function AlignStep(props: {
  busy: boolean;
  profiles: Record<string, FirstThreeProfile>;
  roleId: string;
  session: RoleStartView;
  onEvaluate: (body: RoleStartEvaluateBody) => void;
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
  const allRated = candidates.length > 0 && candidates.every((item) => session.evaluations[item.talentId]);
  const total = candidates.length || 3;
  const last = at >= candidates.length - 1;
  // The right panel is still reading this person: moving away waits for it
  // (not for a read that has stopped answering).
  const reading = Boolean(candidate && !candidate.verdict && !candidate.failed && !session.readsStalled);

  return (
    <div className="mx-auto grid w-full max-w-[1120px] gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5 md:sticky md:top-0 md:self-start">
        {!searching && !candidate ? (
          // The search finished with no one: say so and offer the way back to the Brief.
          <div className="grid gap-3">
            <p className="text-[14px] leading-6 text-neutral-primary">
              {c("지금 Brief에 맞는 분을 찾지 못했어요. 필수 조건을 조금 넓혀 다시 찾아 볼까요?", "No one fits the Brief right now. Loosen a required condition and search again?")}
            </p>
            <MuteButton className="self-start" disabled={props.busy} onClick={props.onReopen} variant="dark">
              {c("Brief로 돌아가 고치기", "Back to the Brief")}
            </MuteButton>
          </div>
        ) : searching || !candidate ? (
          <LoadingLine
            hint={c("보통 30초쯤 걸려요", "Usually takes about 30 seconds")}
            text={c("Brief에 맞는 첫 3명을 찾고 있어요", "Finding the first three for the Brief")}
          />
        ) : (
          <>
            <span className="text-[13px] text-neutral-muted">
              {c("후보 {p0} / {p1}", "Candidate {p0} of {p1}", { p0: at + 1, p1: total })}
            </span>
            <h1 className="text-[22px] font-normal leading-8 tracking-[-0.02em] text-neutral-primary">
              {c("이 후보는 어떤가요?", "How does this person look?")}
            </h1>
            <CandidateRating
              busy={props.busy}
              candidate={candidate}
              editable={session.phase === "evaluating"}
              evaluation={session.evaluations[candidate.talentId]}
              key={candidate.talentId}
              onEvaluate={props.onEvaluate}
            />
            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-1">
                <MuteButton
                  aria-label={c("이전 후보", "Previous candidate")}
                  className={ARROW_DISABLED}
                  disabled={at === 0 || reading}
                  onClick={() => setIndex(at - 1)}
                  size="lg"
                >
                  <ArrowLeft className="size-4" />
                </MuteButton>
                <MuteButton
                  aria-label={c("다음 후보", "Next candidate")}
                  className={ARROW_DISABLED}
                  disabled={last || reading}
                  onClick={() => setIndex(at + 1)}
                  size="lg"
                >
                  <ArrowRight className="size-4" />
                </MuteButton>
              </div>
              {/* The step's Next appears on the last person only. */}
              {last ? (
                <MuteButton disabled={props.busy || !allRated} onClick={props.onNext} size="lg" variant="primary">
                  {c("다음", "Next")}
                </MuteButton>
              ) : null}
            </div>
            {last && !allRated ? (
              <span className="text-[12px] text-neutral-muted">
                {c("세 명 모두 평가하면 다음으로 넘어갈 수 있어요.", "Rate all three to continue.")}
              </span>
            ) : null}
            <MuteButton className="self-start" disabled={props.busy} onClick={props.onReopen} variant="transparent">
              {c("Brief로 돌아가 고치기", "Back to the Brief")}
            </MuteButton>
          </>
        )}
        {session.notice?.thin && !searching ? (
          <div className="rounded-md bg-info-faded px-4 py-3 text-[13px] leading-5">
            <p>{c("지금 조건에 맞는 분이 많지 않아요. 조건을 조금 넓혀 볼까요?", "Few people meet the conditions now. Shall we widen one a little?")}</p>
            {session.notice.conditions.length ? (
              <ul className="mt-2 grid gap-2">
                {session.notice.conditions.map((condition) => (
                  <li className="flex flex-wrap items-center justify-between gap-2" key={condition.id}>
                    <span>
                      {`'${condition.label}': `}
                      {condition.band === "big"
                        ? c("풀면 후보가 크게 늘어요", "Widening adds many candidates")
                        : c("풀면 후보가 조금 늘어요", "Widening adds a few candidates")}
                    </span>
                    <MuteButton
                      disabled={props.busy || Object.keys(session.evaluations).length > 0}
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
      </div>

      <div className="min-w-0 rounded-lg border border-neutral-1000-a05 p-5 md:p-6">
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
            <RoleStartCandidateCard
              candidate={candidate}
              criteria={session.brief.criteria}
              profile={props.profiles[candidate.talentId]}
              roleId={props.roleId}
            />
            {!candidate.verdict && !candidate.failed && session.readsStalled ? (
              <p className="mt-6 text-[13px] leading-5 text-neutral-muted">
                {c("이 후보 정리가 멈췄어요. 프로필을 보고 평가해 주셔도 돼요.", "This read stopped. You can still rate the person from the profile.")}
              </p>
            ) : !candidate.verdict && !candidate.failed ? (
              <div className="mt-6">
                <LoadingLine text={c("이 후보를 살펴보고 있어요", "Reviewing this person")} />
              </div>
            ) : candidate.verdict?.tldr ? (
              <p className="mt-4 text-[13px] leading-5 text-neutral-primary">{candidate.verdict.tldr}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
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
function SentenceChip({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <MuteButton aria-label={label} className="mx-0.5 align-baseline text-[16px]" size="md">
        {children}
        <ChevronDown aria-hidden className="size-3.5" />
      </MuteButton>
    </DropdownMenuTrigger>
  );
}

/**
 * How the Role runs after registration, as one sentence with choices: search
 * days and time, the Slack channels that hear about new people, and the owner
 * copied on intro emails. Registering saves them, then turns the Role on.
 */
function FinalizeStep(props: {
  busy: boolean;
  role: OrgRole;
  session: RoleStartView;
  workspaceId: string;
  onRegister: (notification: { channelIds?: string[]; assigneeUserId?: string }) => Promise<void>;
  onBack: () => void;
}) {
  const { c } = useOrgLocale();
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const { bootstrap, user } = useOrgWorkspace();
  const updateRole = useUpdateOrgRole();
  const connectSlack = useConnectOrgSlack();
  const settingsQuery = useOrgRoleNotificationSettings({ roleId: props.role.roleId, workspaceId: props.workspaceId });
  const slackStatusQuery = useOrgSlackStatus({ workspaceId: props.workspaceId });
  const registering = props.session.phase === "registering" || props.session.phase === "batch";

  const savedDays = (props.role.introSearchDate ?? DEFAULT_INTRO_SEARCH_DAYS).filter((day) => INTRO_SEARCH_DAYS.includes(day));
  const savedHour = props.role.introSearchTime ?? DEFAULT_INTRO_SEARCH_HOUR;
  const [days, setDays] = useState<IntroSearchDay[] | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const shownDays = days ?? savedDays;
  const shownHour = hour ?? savedHour;

  const channels = settingsQuery.data?.channels ?? [];
  const defaultChannels = channels.filter((channel) => channel.enabled).map((channel) => channel.channelId);
  const [channelIds, setChannelIds] = useState<string[] | null>(null);
  const shownChannels =
    channelIds ?? (defaultChannels.length ? defaultChannels : channels.length === 1 ? [channels[0]!.channelId] : []);
  const slackConnected = slackStatusQuery.data?.connected ?? channels.length > 0;

  // Same default as role creation: the saved owner, otherwise whoever registers.
  const members = bootstrap.members.filter((member) => member.email);
  const savedOwner = settingsQuery.data?.assigneeUserIds.at(-1) ?? null;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const shownOwner = ownerId ?? savedOwner ?? user.id;
  const ownerName = members.find((member) => member.userId === shownOwner)?.name || c("담당자", "the owner");

  const dayText = shownDays.map((day) => c(...DAY_LABEL[day]!)).join(c("·", ", "));
  const channelText = shownChannels
    .map((id) => channels.find((channel) => channel.channelId === id)?.channelName ?? id)
    .map((name) => (name.startsWith("#") ? name : `#${name}`))
    .join(", ");

  const register = async () => {
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
          message: error instanceof Error ? error.message : c("검색 일정을 저장하지 못했어요.", "Could not save the search schedule."),
          variant: "error",
        });
        return;
      }
    }
    await props.onRegister({
      ...(shownChannels.length ? { channelIds: shownChannels } : {}),
      assigneeUserId: shownOwner,
    });
  };

  if (registering) {
    return (
      <Centered className="gap-6">
        <h1 className="text-[22px] font-normal leading-8 tracking-[-0.02em] text-neutral-primary">
          {c("평가를 반영하고 있어요", "Applying your ratings")}
        </h1>
        <LoadingLine
          hint={c("보통 1분 안에 끝나요", "Usually takes 1–2 minutes")}
          text={c("평가를 바탕으로 더 잘 맞는 후보 한 분을 찾고 있어요", "Refining the Brief and finding one more person")}
        />
      </Centered>
    );
  }

  const dayChip = (
    <DropdownMenu>
      <SentenceChip label={c("검색 요일", "Search days")}>{dayText}</SentenceChip>
      <DropdownMenuContent align="start" className="w-36">
        {INTRO_SEARCH_DAYS.map((day) => {
          const on = shownDays.includes(day);
          return (
            <DropdownMenuItem
              key={day}
              onSelect={(event) => {
                event.preventDefault();
                const next = on ? shownDays.filter((item) => item !== day) : [...shownDays, day];
                if (next.length) setDays(INTRO_SEARCH_DAYS.filter((item) => next.includes(item)));
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
      <SentenceChip label={c("검색 시각", "Search time")}>{hourLabel(c, shownHour)}</SentenceChip>
      <DropdownMenuContent align="start" className="max-h-72 w-32 overflow-y-auto">
        {HOURS.map((value) => (
          <DropdownMenuItem key={value} onSelect={() => setHour(value)} selected={value === shownHour} variant="sm">
            {hourLabel(c, value)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const channelChip = channels.length ? (
    <DropdownMenu>
      <SentenceChip label={c("알림 Slack 채널", "Slack channel")}>
        {channelText || c("채널 고르기", "Choose a channel")}
      </SentenceChip>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        {channels.map((channel) => {
          const on = shownChannels.includes(channel.channelId);
          const name = channel.channelName ?? channel.channelId;
          return (
            <DropdownMenuItem
              key={channel.channelId}
              onSelect={(event) => {
                event.preventDefault();
                setChannelIds(on ? shownChannels.filter((id) => id !== channel.channelId) : [...shownChannels, channel.channelId]);
              }}
              selected={on}
              variant="sm"
            >
              {name.startsWith("#") ? name : `#${name}`}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;
  const ownerChip = (
    <DropdownMenu>
      <SentenceChip label={c("담당자", "Owner")}>{ownerName}</SentenceChip>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
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
        <h1 className="text-[22px] font-normal leading-8 tracking-[-0.02em] text-neutral-primary">
          {c("이렇게 시작할게요", "Here's how the role runs")}
        </h1>
        {slackConnected && channels.length ? (
          <p className="mt-4 text-[18px] leading-[2.4rem] text-neutral-primary">
            {c("매주", "Every")} {dayChip} {hourChip}
            {c("에 새 후보를 찾아 역할당 최대 {p0}명을", ", Harper looks for new people and posts up to {p0} per role to", {
              p0: SCHEDULED_ROLE_LIMIT,
            })}{" "}
            {channelChip}
            {c("에 알려 드릴게요. 소개 메일에는", ". Intro emails copy")} {ownerChip}
            {c("님을 참조로 넣을게요.", ".")}
          </p>
        ) : (
          <p className="mt-4 text-[18px] leading-[2.4rem] text-neutral-primary">
            {c("Slack을 연결하면 매주", "Once Slack is connected, every")} {dayChip} {hourChip}
            {c("에 새 후보를 찾아 역할당 최대 {p0}명을 알려 드릴게요. 소개 메일에는", ", Harper looks for new people and shares up to {p0} per role. Intro emails copy", {
              p0: SCHEDULED_ROLE_LIMIT,
            })}{" "}
            {ownerChip}
            {c("님을 참조로 넣을게요.", ".")}
          </p>
        )}
        {!slackConnected ? (
          <MuteButton
            className="mt-3"
            disabled={connectSlack.isPending}
            onClick={async () => {
              try {
                const result = await connectSlack.mutateAsync({ returnTo: router.asPath, workspaceId: props.workspaceId });
                window.location.assign(result.authorizeUrl);
              } catch (error) {
                addToast({
                  message: error instanceof Error ? error.message : c("Slack 연결을 시작하지 못했어요.", "Could not start the Slack connection."),
                  variant: "error",
                });
              }
            }}
          >
            {c("Slack 연결하기", "Connect Slack")}
            <ArrowRight className="size-4" />
          </MuteButton>
        ) : !channels.length ? (
          <MuteButton asChild className="mt-3">
            <Link href={buildOrgHref({ orgId: props.workspaceId, page: "settings" })}>
              {c("Slack 채널 추가하기", "Add a Slack channel")}
              <ArrowRight className="size-4" />
            </Link>
          </MuteButton>
        ) : null}
        <p className="mt-4 text-[13px] leading-5 text-neutral-muted">
          {c(
            "등록하면 평가를 반영해 한 분을 더 추천하고 역할이 시작돼요. 나중에 설정 탭에서 바꿀 수 있어요.",
            "When you register, Harper applies your ratings, recommends one more person and starts the role. You can change these in Settings later."
          )}
        </p>
        {!registering && props.session.progress.some((item) => item.step === "batch" && item.status === "error") ? (
          // A registration that stopped came back here: say so before the team tries again.
          <p className="mt-2 text-[13px] leading-5 text-critical">
            {c("지난번 등록을 마치지 못했어요. 다시 눌러 주세요.", "The last registration did not finish. Please try again.")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MuteButton
          disabled={props.busy || updateRole.isPending || !slackConnected || !shownChannels.length}
          onClick={() => void register()}
          size="lg"
          variant="primary"
        >
          {c("역할 등록하기", "Register role")}
        </MuteButton>
        <MuteButton disabled={props.busy} onClick={props.onBack} variant="transparent">
          {c("후보 평가로 돌아가기", "Back to ratings")}
        </MuteButton>
      </div>
    </Centered>
  );
}
