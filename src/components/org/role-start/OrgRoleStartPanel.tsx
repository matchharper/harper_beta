import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandidateHeader,
  CandidateRating,
  CandidateRead,
  type RoleStartEvaluateBody,
  type RoleStartEvaluation,
} from "@/components/org/role-start/RoleStartCandidate";
import { RoleBriefFields } from "@/components/org/role-start/RoleBriefFields";
import {
  RoleSectionHeading,
} from "@/components/org/role-overview/RoleOverviewShared";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { buildOrgHref } from "@/lib/org/routes";
import { cn } from "@/lib/utils";
import { criterionLevel, ORG_ROLE_CRITERION_LEVELS, type OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import type {
  RoleStartBriefView,
  RoleStartCandidateView,
  RoleStartView,
} from "@/lib/org/roleStart/view";
import { useToastStore } from "@/store/useToastStore";

type Issue = { level: "conflict" | "warning"; text: string };

type Evaluation = RoleStartEvaluation;
type EvaluateBody = RoleStartEvaluateBody;

type SessionView = RoleStartView;
type RoleStartBrief = RoleStartBriefView;
type RoleStartCandidate = RoleStartCandidateView;
type RoleStartQuestion = SessionView["questions"]["history"][number];
type RoleStartProgress = SessionView["progress"][number];
type RoleStartPhase = SessionView["phase"];

type StartResponse = {
  session: SessionView | null;
  role: { status: string; hasDescription: boolean };
  issues: Issue[];
  versions: Array<{ version: number; createdAt: string; summary: string | null }>;
};

type MutationResult = {
  session?: SessionView | null;
  issues?: Issue[];
  applied?: string;
  missingFields?: string[];
};

const ACTIVE_PHASES = new Set<RoleStartPhase>(["drafting", "searching", "batch"]);

type LocaleC = ReturnType<typeof useOrgLocale>["c"];

/** Names exactly what registration still needs; Slack and the owner are only two of the fields. */
export function registerMissingMessage(c: LocaleC, missingFields: string[]) {
  const labels: Record<string, [string, string]> = {
    role_title: ["역할 이름", "role title"],
    description: ["역할 설명", "description"],
    request: ["Brief", "Brief"],
    location: ["근무 지역", "work location"],
    work_mode: ["근무 형태", "work arrangement"],
    employment_type: ["고용 형태", "employment type"],
    connected_slack: ["알림 받을 곳", "notification destination"],
    assignee: ["담당자", "owner"],
  };
  const missing = missingFields.map((field) => labels[field] ?? [field, field]);
  // Korean particles follow the last syllable: 근무 지역을 / 담당자를, 근무 지역과 / 담당자와.
  const hasFinal = (word: string) => {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    return code >= 0 && code <= 11171 ? code % 28 !== 0 : /[^aeiouy]$/i.test(word);
  };
  const ko = missing
    .map(([name], index) =>
      index === missing.length - 1 ? `${name}${hasFinal(name) ? "을" : "를"}` : `${name}${hasFinal(name) ? "과" : "와"}`
    )
    .join(" ");
  const enNames = missing.map(([, en]) => en);
  const en = enNames.length > 1 ? `${enNames.slice(0, -1).join(", ")} and ${enNames[enNames.length - 1]}` : enNames[0];
  return c(
    "등록하려면 {p0} 정해 주세요. 채팅에서 알려 주시거나 설정 탭에서 고를 수 있어요.",
    "To register, set the {p1}. Tell the chat or choose it in Settings.",
    { p0: ko, p1: en }
  );
}

export function OrgRoleStartPanel({ roleId, workspaceId }: { roleId: string; workspaceId: string }) {
  const { c } = useOrgLocale();
  const { permissions } = useOrgWorkspace();
  const canManage = permissions.canManageCandidates;
  const addToast = useToastStore((state) => state.add);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["org-role-start", workspaceId, roleId], [roleId, workspaceId]);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchWithInternalAuth<StartResponse>(
        `/api/org/role-start?roleId=${encodeURIComponent(roleId)}&workspaceId=${encodeURIComponent(workspaceId)}`
      ),
    refetchInterval: (current) => {
      const session = current.state.data?.session;
      if (!session) return false;
      const verdictsPending =
        session.phase === "evaluating" &&
        session.firstCandidates.some((candidate) => !candidate.verdict && !candidate.failed);
      const waitingForQuestion = session.phase === "questions" && !session.pendingQuestion;
      return ACTIVE_PHASES.has(session.phase) || verdictsPending || waitingForQuestion ? 1_000 : false;
    },
  });
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

  const data = query.data;
  const session = data?.session ?? null;

  if (query.isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center text-[13px] text-neutral-muted">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        {c("불러오는 중입니다.", "Loading.")}
      </div>
    );
  }
  if (!session) {
    return (
      <OrgSection>
        <RoleSectionHeading
          description={c(
            "역할 설명을 읽고 비교할 기준 초안을 만든 뒤, 기준을 정하는 데 꼭 필요한 질문만 하나씩 드려요. Brief를 확정하면 1분 안에 첫 3명을 보여 드려요.",
            "Harper drafts comparison criteria from the role description, then asks only the questions that change who you see. After you confirm the Brief, the first three candidates appear within a minute."
          )}
          size="large"
          title={c("역할 시작하기", "Start this role")}
        />
        {!data?.role.hasDescription ? (
          <div className="mt-4 rounded-md bg-bg-basement px-4 py-3 text-[13px] leading-5 text-neutral-muted">
            {c(
              "채팅에서 역할 설명을 먼저 정리해 주세요. 설명이 저장되면 시작할 수 있어요.",
              "Describe the role in the chat first. You can start once the description is saved."
            )}
          </div>
        ) : null}
        <MuteButton
          className="mt-4"
          disabled={!canManage || mutation.isPending || !data?.role.hasDescription}
          onClick={() => run({ action: "start" })}
          variant="primary"
        >
          {mutation.isPending ? c("기준 초안을 만드는 중", "Drafting criteria") : c("기준 초안 만들기", "Draft criteria")}
        </MuteButton>
      </OrgSection>
    );
  }

  return (
    <div className="flex flex-col gap-8 text-neutral-primary">
      <StepLine phase={session.phase} />
      {session.stalled ? (
        <OrgSection>
          <p className="text-[13px] text-neutral-muted">
            {c("진행이 멈춘 것 같아요. 다시 시도할 수 있어요.", "This step seems to have stopped. You can try again.")}
          </p>
          <MuteButton className="mt-3" disabled={!canManage || mutation.isPending} onClick={() => run({ action: "retry" })}>
            {c("다시 시도", "Try again")}
          </MuteButton>
        </OrgSection>
      ) : null}
      {session.phase === "drafting" ? (
        <ProgressList items={session.progress.filter((item) => item.step === "draft")} />
      ) : null}
      {session.phase === "failed" ? (
        <OrgSection>
          <p className="text-[13px] text-neutral-muted">
            {c("기준 초안을 만들지 못했어요. 다시 시도해 주세요.", "Could not draft the criteria. Please try again.")}
          </p>
          <MuteButton className="mt-3" disabled={mutation.isPending} onClick={() => run({ action: "start" })}>
            {c("다시 시도", "Try again")}
          </MuteButton>
        </OrgSection>
      ) : null}
      {session.phase === "superseded" ? (
        <OrgSection>
          <p className="text-[13px] text-neutral-muted">
            {c(
              "다른 방법으로 등록을 시도해서 역할 시작을 멈췄어요. 처음부터 다시 시작할 수 있어요.",
              "Role start stopped because the Role was registered another way. You can start it again."
            )}
          </p>
          <MuteButton className="mt-3" disabled={!canManage || mutation.isPending} onClick={() => run({ action: "start" })}>
            {c("다시 시작", "Start again")}
          </MuteButton>
        </OrgSection>
      ) : null}
      {session.phase === "questions" && session.pendingQuestion ? (
        <QuestionSection
          busy={mutation.isPending || !canManage}
          history={session.questions.history}
          onAnswer={(body) => run({ action: "answer", questionId: session.pendingQuestion!.id, ...body })}
          onFinish={() => run({ action: "finish_questions" })}
          question={session.pendingQuestion}
        />
      ) : session.phase === "questions" ? (
        <OrgSection aria-label={c("질문", "Question")}>
          <div className="flex min-h-24 items-center text-[13px] text-neutral-muted">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {c("반영하는 중", "Applying")}
          </div>
          <MuteButton
            disabled={mutation.isPending || !canManage}
            onClick={() => run({ action: "finish_questions" })}
            variant="transparent"
          >
            {c("질문 그만하고 Brief 보기", "Stop questions and review the Brief")}
          </MuteButton>
        </OrgSection>
      ) : session.questions.history.length && session.phase === "review" ? (
        <AnsweredList history={session.questions.history} />
      ) : null}
      {session.phase === "review" || session.phase === "questions" ? (
        <BriefReview
          busy={mutation.isPending || !canManage}
          issues={data?.issues ?? []}
          onConfirm={() => run({ action: "confirm" })}
          onPrewarm={() => run({ action: "prewarm" })}
          onRequest={async (request) => {
            const result = await run({ action: "edit", request });
            if (result?.applied) addToast({ message: result.applied, variant: "success" });
          }}
          onSave={(brief) => run({ action: "edit", brief, briefHash: session.briefHash })}
          readOnly={session.phase === "questions"}
          session={session}
          versions={data?.versions ?? []}
        />
      ) : null}
      {["searching", "evaluating", "registering", "batch", "done"].includes(session.phase) ? (
        <FirstThree
          busy={mutation.isPending || !canManage}
          onEvaluate={(body) => run({ action: "evaluate", ...body })}
          onRegister={async () => {
            const result = await run({ action: "register" });
            if (result && result.missingFields?.length) {
              addToast({ message: registerMissingMessage(c, result.missingFields), variant: "error" });
            }
          }}
          onReopen={() => run({ action: "reopen_review" })}
          onWiden={(conditionId) => run({ action: "widen_condition", conditionId })}
          session={session}
        />
      ) : null}
      {session.phase === "registering" || session.phase === "batch" || session.phase === "done" ? (
        <FirstBatch roleId={roleId} session={session} workspaceId={workspaceId} />
      ) : null}
    </div>
  );
}

function StepLine({ phase }: { phase: RoleStartPhase }) {
  const { c } = useOrgLocale();
  const steps: Array<{ label: string; phases: RoleStartPhase[] }> = [
    { label: c("질문", "Questions"), phases: ["drafting", "questions"] },
    { label: c("Brief 확인", "Review Brief"), phases: ["review"] },
    { label: c("첫 3명", "First three"), phases: ["searching", "evaluating", "registering"] },
    { label: c("등록", "Register"), phases: ["batch", "done"] },
  ];
  const current = steps.findIndex((step) => step.phases.includes(phase));
  return (
    <ol aria-label={c("진행 단계", "Progress")} className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium">
      {steps.map((step, index) => (
        <li
          aria-current={index === current ? "step" : undefined}
          className={cn(
            "rounded-md px-2 py-1 leading-5",
            index === current ? "bg-bg-weak text-neutral-primary" : "text-neutral-soft"
          )}
          key={step.label}
        >
          {index + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}

function useStepLabel() {
  const { c } = useOrgLocale();
  return (kind: string | null, status: string | undefined) => {
    const done = status !== "running";
    switch (kind) {
      case "read":
        return done ? c("읽었어요", "Read") : c("읽는 중", "Reading");
      case "organize":
        return done ? c("정리했어요", "Organized") : c("정리하는 중", "Organizing");
      case "find":
        return done ? c("후보를 찾았어요", "Found candidates") : c("후보 찾는 중", "Finding candidates");
      case "review":
        return done ? c("살펴봤어요", "Reviewed") : c("살펴보는 중", "Reviewing");
      case "apply":
        return done ? c("반영했어요", "Applied") : c("반영하는 중", "Applying");
      case "choose":
        return done ? c("골랐어요", "Chosen") : c("고르는 중", "Choosing");
      default:
        return done ? c("마쳤어요", "Done") : c("진행하는 중", "Working");
    }
  };
}

function ProgressList({ items }: { items: RoleStartProgress[] }) {
  const label = useStepLabel();
  if (!items.length) return null;
  return (
    <ul aria-live="polite" className="flex flex-col gap-1.5 text-[13px] leading-5 text-neutral-muted">
      {items.map((item) => (
        <li className="flex items-center gap-2" key={item.key}>
          {item.status === "running" ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          ) : item.status === "error" ? (
            <X aria-hidden className="size-3.5" />
          ) : (
            <BadgeCheck aria-hidden className="size-3.5" />
          )}
          <span>{item.text || label(item.kind, item.status)}</span>
        </li>
      ))}
    </ul>
  );
}

function QuestionSection(props: {
  busy: boolean;
  history: RoleStartQuestion[];
  question: RoleStartQuestion;
  onAnswer: (body: { chipId?: string; text?: string; skip?: boolean }) => void;
  onFinish: () => void;
}) {
  const { c } = useOrgLocale();
  const [text, setText] = useState("");
  useEffect(() => setText(""), [props.question.id]);
  return (
    <OrgSection aria-label={c("질문", "Question")}>
      <div>
        <RoleSectionHeading description={props.question.why} size="large" title={props.question.question} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.question.chips.map((chip) => (
          <MuteButton disabled={props.busy} key={chip.id} onClick={() => props.onAnswer({ chipId: chip.id })}>
            {chip.label}
          </MuteButton>
        ))}
      </div>
      <form
        className="mt-3 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) props.onAnswer({ text: text.trim() });
        }}
      >
        <Textarea
          aria-label={c("직접 답하기", "Answer in your own words")}
          autoResize
          className="min-h-[72px]"
          onChange={(event) => setText(event.target.value)}
          placeholder={c("직접 답을 적어도 돼요", "Or answer in your own words")}
          rows={3}
          value={text}
        />
        <div className="flex flex-wrap items-center gap-2">
          <MuteButton disabled={props.busy || !text.trim()} type="submit" variant="dark">
            {props.busy ? c("반영하는 중", "Applying") : c("답하기", "Answer")}
          </MuteButton>
          <MuteButton disabled={props.busy} onClick={() => props.onAnswer({ skip: true })} type="button" variant="transparent">
            {c("건너뛰기", "Skip")}
          </MuteButton>
          <MuteButton disabled={props.busy} onClick={props.onFinish} type="button" variant="transparent">
            {c("질문 그만하고 Brief 보기", "Stop questions and review the Brief")}
          </MuteButton>
        </div>
      </form>
      {props.history.length ? (
        <div className="mt-6">
          <AnsweredList history={props.history} />
        </div>
      ) : null}
    </OrgSection>
  );
}

function AnsweredList({ history }: { history: RoleStartQuestion[] }) {
  const { c } = useOrgLocale();
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-neutral-muted">
        {c("지금까지 답한 질문 {p0}개", "{p0} answered questions", { p0: history.length })}
      </summary>
      <div className="mt-3 grid gap-2">
        {history.map((item) => {
          const chip = item.chips.find((candidate) => candidate.id === item.answer?.chipId);
          return (
            <div className="rounded-md bg-bg-basement px-4 py-3" key={item.id}>
              <p className="text-[13px] font-medium">{item.question}</p>
              <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
                {item.status === "skipped" ? c("건너뜀", "Skipped") : chip?.label ?? item.answer?.text}
                {item.answer?.applied ? ` · ${item.answer.applied}` : ""}
                {item.answer?.notApplied ? ` · ${c("반영하지 못해 다시 여쭤볼게요", "Not applied; we'll ask again")}` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function BriefReview(props: {
  busy: boolean;
  issues: Issue[];
  readOnly: boolean;
  session: SessionView;
  versions: StartResponse["versions"];
  onSave: (brief: RoleStartBrief) => void;
  onRequest: (request: string) => void;
  onConfirm: () => void;
  onPrewarm: () => void;
}) {
  const { c } = useOrgLocale();
  const serverBrief = JSON.stringify(props.session.brief);
  const [draft, setDraft] = useState<RoleStartBrief>(props.session.brief);
  useEffect(() => setDraft(JSON.parse(serverBrief)), [serverBrief]);
  const prewarmed = useRef(false);
  const { onPrewarm, readOnly } = props;
  useEffect(() => {
    if (!readOnly && !prewarmed.current) {
      prewarmed.current = true;
      onPrewarm();
    }
  }, [readOnly, onPrewarm]);
  const dirty = JSON.stringify(draft) !== serverBrief;
  const conflicts = props.issues.filter((issue) => issue.level === "conflict");
  const invalid = draft.criteria.some((item) => !item.name.trim() || !item.criteria.trim());

  if (readOnly) {
    return (
      <OrgSection aria-label={c("지금까지의 Brief", "Brief so far")}>
        <RoleSectionHeading title={c("지금까지의 Brief", "Brief so far")} />
        <div className="mt-3 grid gap-2">
          {props.session.brief.criteria.map((criterion) => (
            <div className="flex items-center gap-2 text-[13px]" key={criterion.id ?? criterion.name}>
              <BadgeCheck className="size-4 shrink-0 text-positive" />
              <span>{criterion.name}</span>
              <span className="text-neutral-soft">
                {(({ ko, en }) => c(ko, en))(
                  ORG_ROLE_CRITERION_LEVELS.find((item) => item.level === criterionLevel(criterion))!
                )}
              </span>
            </div>
          ))}
        </div>
      </OrgSection>
    );
  }

  return (
    <>
      <OrgSection aria-label={c("Brief 확인", "Review Brief")}>
        <RoleSectionHeading
          description={c(
            "확정하면 이 기준으로 첫 3명을 골라요. 기준과 필수 조건은 직접 고치거나 아래에 글로 요청할 수 있어요.",
            "Harper picks the first three with these criteria once you confirm. Edit them directly or describe the change below."
          )}
          size="large"
          title={c("Brief 확인", "Review Brief")}
        />
        <Textarea
          aria-label={c("Brief 요약", "Brief summary")}
          autoResize
          className="mt-4 min-h-[88px]"
          disabled={props.busy}
          onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          rows={3}
          value={draft.summary}
        />

        <RoleBriefFields busy={props.busy} dirty={dirty} draft={draft} onRequest={props.onRequest} setDraft={setDraft} />

        {props.issues.length ? (
          <div aria-label={c("확인할 점", "Things to check")} className="mt-8 grid gap-2">
            {props.issues.map((issue) => (
              <div
                className={cn(
                  "rounded-md px-4 py-3 text-[13px] leading-5",
                  issue.level === "conflict" ? "bg-critical-faded text-critical" : "bg-info-faded text-neutral-primary"
                )}
                key={issue.text}
              >
                {issue.text}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <MuteButton disabled={props.busy || dirty || conflicts.length > 0} onClick={props.onConfirm} size="lg" variant="primary">
            {c("확정하고 첫 3명 보기", "Confirm and see the first three")}
          </MuteButton>
          {props.versions.length ? (
            <details className="text-[12px] text-neutral-muted">
              <summary className="cursor-pointer">
                {c("Brief 버전 {p0}개", "{p0} Brief versions", { p0: props.versions.length })}
              </summary>
              <div className="mt-2 grid gap-1">
                {props.versions.map((version) => (
                  <span key={version.version}>
                    v{version.version} · {new Date(version.createdAt).toLocaleString("ko-KR")}
                    {version.summary ? ` · ${version.summary}` : ""}
                  </span>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </OrgSection>
      {dirty ? (
        <OrgUnsavedChangesBar
          canSave={!invalid}
          hasChanges={dirty}
          onCancel={() => setDraft(JSON.parse(serverBrief))}
          onSave={() => props.onSave(draft)}
          pending={props.busy}
        />
      ) : null}
    </>
  );
}

function FirstThree(props: {
  busy: boolean;
  session: SessionView;
  onEvaluate: (body: EvaluateBody) => void;
  onRegister: () => void;
  onReopen: () => void;
  onWiden: (conditionId: string) => void;
}) {
  const { c } = useOrgLocale();
  const { session } = props;
  const searching = session.phase === "searching";
  const notice = session.notice;
  const allRated =
    session.firstCandidates.length > 0 &&
    session.firstCandidates.every((candidate) => session.evaluations[candidate.talentId]);
  const editable = session.phase === "evaluating";
  return (
    <OrgSection aria-label={c("첫 3명", "First three")}>
      <RoleSectionHeading
        description={c(
          "후보마다 얼마나 맞는지 골라 주세요. 등록하면 평가를 반영해 한 분을 더 추천해요.",
          "Rate each person. When you register, Harper applies your ratings and recommends one more person."
        )}
        size="large"
        title={c("첫 {p0}명", "First {p0}", { p0: session.firstCandidates.length || 3 })}
      />
      <div className="mt-4">
        <ProgressList items={session.progress.filter((item) => item.step === "first_three")} />
        {searching ? (
          <p className="mt-2 text-[12px] leading-5 text-neutral-soft">
            {c("보통 30초쯤 걸려요", "Usually takes about 30 seconds")}
          </p>
        ) : null}
      </div>
      {notice?.thin && !searching ? (
        <div className="mt-4 rounded-md bg-info-faded px-4 py-3 text-[13px] leading-5">
          <p>{c("지금 조건에 맞는 분이 많지 않아요. 조건을 조금 넓혀 볼까요?", "Few people meet the conditions now. Shall we widen one a little?")}</p>
          {notice.conditions.length ? (
            <ul className="mt-2 grid gap-2">
              {notice.conditions.map((condition) => (
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
      <div className="mt-6 grid grid-cols-1 gap-4">
        {session.firstCandidates.map((candidate) =>
          !candidate.verdict && !candidate.failed ? (
            <div
              aria-label={c("판정을 쓰는 중", "Writing the review")}
              className="flex min-h-40 items-center justify-center rounded-lg border border-neutral-1000-a05 text-[13px] text-neutral-muted"
              key={candidate.talentId}
            >
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              {c("살펴보는 중", "Reviewing")}
            </div>
          ) : (
          <CandidateCard
            busy={props.busy}
            candidate={candidate}
            criteria={session.brief.criteria}
            editable={editable}
            evaluation={session.evaluations[candidate.talentId]}
            key={candidate.talentId}
            onEvaluate={props.onEvaluate}
          />
          )
        )}
      </div>
      {editable ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <MuteButton disabled={props.busy || !allRated} onClick={props.onRegister} size="lg" variant="primary">
            {c("역할 등록하기", "Register role")}
          </MuteButton>
          <MuteButton disabled={props.busy} onClick={props.onReopen} variant="transparent">
            {c("Brief로 돌아가 고치기", "Back to the Brief")}
          </MuteButton>
          {!allRated ? (
            <span className="text-[12px] text-neutral-muted">
              {c("세 명 모두 평가하면 등록할 수 있어요.", "Rate all three to register.")}
            </span>
          ) : null}
        </div>
      ) : null}
    </OrgSection>
  );
}

function CandidateCard(props: {
  busy: boolean;
  candidate: RoleStartCandidate;
  criteria: SessionView["brief"]["criteria"];
  editable: boolean;
  evaluation?: Evaluation;
  onEvaluate: (body: EvaluateBody) => void;
}) {
  const { c } = useOrgLocale();
  return (
    <article className="min-w-0 rounded-lg border border-neutral-1000-a05 p-4 sm:p-5">
      <CandidateHeader candidate={props.candidate} />
      <CandidateRead candidate={props.candidate} criteria={props.criteria} />
      <div className="mt-6 grid gap-2">
        <span className="text-[13px] font-medium">{c("이 후보는 어떤가요?", "How does this person look?")}</span>
        <CandidateRating {...props} />
      </div>
    </article>
  );
}

function FirstBatch({ roleId, session, workspaceId }: { roleId: string; session: SessionView; workspaceId: string }) {
  const { c } = useOrgLocale();
  const batch = session.batch;
  return (
    <OrgSection aria-label={c("평가를 반영한 추천", "Recommendation from your ratings")}>
      <RoleSectionHeading size="large" title={c("평가를 반영한 추천", "Recommendation from your ratings")} />
      <div className="mt-4">
        <ProgressList items={session.progress.filter((item) => item.step === "batch")} />
        {batch?.status !== "done" && batch?.status !== "failed" ? (
          <p className="mt-2 text-[12px] leading-5 text-neutral-soft">
            {c("보통 1분 안에 끝나요", "Usually takes 1–2 minutes")}
          </p>
        ) : null}
      </div>
      {batch?.status === "done" && batch.candidates.length ? (
        <div className="mt-4 grid gap-2">
          {batch.candidates.map((candidate) => (
            <div className="rounded-md bg-bg-basement px-4 py-3" key={candidate.talentId}>
              <p className="text-[13px] font-medium">{candidate.name || c("이름 없음", "No name")}</p>
              <p className="mt-1 text-[13px] leading-5 text-neutral-muted">{candidate.verdict?.tldr ?? candidate.headline}</p>
            </div>
          ))}
          <a
            className="justify-self-start text-[13px] text-link underline-offset-2 hover:underline"
            href={buildOrgHref({ orgId: workspaceId, page: "role", roleId, tab: "inbox" })}
          >
            {c("인박스에서 보기", "Open the inbox")}
          </a>
        </div>
      ) : null}
      {batch?.kept?.length ? (
        <p className="mt-3 text-[13px] leading-5 text-neutral-muted">
          {c("첫 3명 중 {p0}님도 인박스에 있어요.", "{p0} from the first three are in the inbox too.", { p0: batch.kept.join("님, ") })}
        </p>
      ) : null}
      {batch?.status === "failed" || (batch?.status === "done" && !batch.candidates.length) ? (
        <p className="mt-4 text-[13px] text-critical">
          {c("지금은 더 추천할 분이 없어요. 정기 추천에서 이어서 찾아볼게요.", "No one else to recommend right now. We'll keep looking in regular recommendations.")}
        </p>
      ) : null}
    </OrgSection>
  );
}
