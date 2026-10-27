import Image from "next/image";
import { useState } from "react";
import { OrgCriteriaEvaluation } from "@/components/org/OrgCriteriaEvaluation";
import { RoleToggleButton } from "@/components/org/role-overview/RoleOverviewShared";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { type OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import type { RoleStartBriefView, RoleStartCandidateView, RoleStartView } from "@/lib/org/roleStart/view";

export type RoleStartEvaluation = RoleStartView["evaluations"][string];

export type RoleStartEvaluateBody = {
  talentId: string;
  rating: OrgRoleCriterionGrade | null;
  answer?: string | null;
  reasonIds?: string[];
  reasonText?: string | null;
  reasonsSkipped?: boolean;
};

/** The team's rating buttons, left to right: "not enough information" sits apart on the right. */
export const ROLE_START_GRADES: OrgRoleCriterionGrade[] = ["excellent", "good", "bad", "uncertain"];

/** Labels of the team's rating (not Harper's per-criterion grades, which keep their own words). */
const REASON_CHIP_MAX = 3;

export function useGradeLabel() {
  const { c } = useOrgLocale();
  return (grade: OrgRoleCriterionGrade) =>
    grade === "excellent"
      ? c("매우 잘 맞음", "Excellent fit")
      : grade === "good"
        ? c("잘 맞음", "Good fit")
        : grade === "uncertain"
          ? c("정보가 부족해요", "Not enough information")
          : c("맞지 않음", "Not a fit");
}

/** Name, current work, years and location. */
export function CandidateHeader({ candidate }: { candidate: RoleStartCandidateView }) {
  const { c } = useOrgLocale();
  const name = candidate.name || c("이름 없음", "No name");
  return (
    <header className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[16px] font-normal text-neutral-muted">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-normal tracking-[-0.02em] text-neutral-primary sm:text-[19px] sm:leading-6">
          {name}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-neutral-muted sm:text-[13px]">
          {[
            candidate.current ?? candidate.headline,
            candidate.years === null
              ? null
              : candidate.yearsBasis === "role"
                ? c("이 직무 경력 약 {p0}년", "About {p0} years in this job", { p0: candidate.years })
                : candidate.yearsBasis === "total"
                  ? c("경력 약 {p0}년 (총 경력 기준)", "About {p0} years (total career)", { p0: candidate.years })
                  : c("경력 약 {p0}년", "About {p0} years", { p0: candidate.years }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {candidate.location ? <p className="mt-0.5 text-[12px] leading-5 text-neutral-muted">{candidate.location}</p> : null}
      </div>
    </header>
  );
}

/** Harper's read of the person: summary and fit by criterion with evidence, 필수 조건 first. */
export function CandidateRead({
  candidate,
}: {
  candidate: RoleStartCandidateView;
  criteria: RoleStartBriefView["criteria"];
}) {
  const { c } = useOrgLocale();
  const verdict = candidate.verdict;
  const groups = verdict?.criteria.length
    ? [{ label: c("평가 기준", "Evaluation criteria"), items: verdict.criteria }]
    : [];

  return (
    <>
      {verdict?.tldr ? <p className="mt-4 text-[13px] leading-5 text-neutral-primary">{verdict.tldr}</p> : null}
      {groups.map((group) => (
        <section className="mt-5 grid gap-3" key={group.label}>
          <h4 className="text-[12px] font-normal text-neutral-soft">{group.label}</h4>
          {group.items.map((item) => (
            <div className="grid gap-1" key={item.criterionId}>
              <OrgCriteriaEvaluation evaluation={{ name: item.name, fitness: item.fitness, content: item.evidence }} />
              <p className="pl-6 text-[12px] leading-5 text-neutral-muted">{item.evidence}</p>
            </div>
          ))}
        </section>
      ))}
      {candidate.failed ? (
        <p className="mt-2 text-[12px] text-neutral-soft">
          {c("이 후보의 정리를 마치지 못했어요.", "Could not finish this candidate's summary.")}
        </p>
      ) : null}
    </>
  );
}

/** A rating, written feedback, or both are saved by the explicit submit action. */
export function CandidateRating(props: {
  busy: boolean;
  candidate: RoleStartCandidateView;
  editable: boolean;
  evaluation?: RoleStartEvaluation;
  onEvaluate: (body: RoleStartEvaluateBody) => unknown;
  onSubmitted?: () => void;
  onBack?: () => void;
  submitDisabled?: boolean;
}) {
  const { c } = useOrgLocale();
  const gradeLabel = useGradeLabel();
  const { candidate } = props;
  const allChips = candidate.verdict?.reasonChips ?? [];
  // Preserve answers recorded before the per-person question was removed.
  const answer = props.evaluation?.answer ?? "";
  const [rating, setRating] = useState<OrgRoleCriterionGrade | null>(props.evaluation?.rating ?? null);
  const [reasonIds, setReasonIds] = useState<string[]>(() =>
    allChips.filter((chip) => props.evaluation?.reasons?.some((reason) => reason.chipId === chip.id)).map((chip) => chip.id)
  );
  const [reasonText, setReasonText] = useState(props.evaluation?.reasonText ?? "");
  const [submitting, setSubmitting] = useState(false);
  const disabled = !props.editable || props.busy || submitting;
  const hasFeedback = rating !== null || Boolean(reasonText.trim());
  const chips = rating ? allChips.filter((chip) => chip.appliesTo.includes(rating)).slice(0, REASON_CHIP_MAX) : [];

  const submit = async () => {
    if (!hasFeedback || disabled || props.submitDisabled) return;
    setSubmitting(true);
    try {
      const result = await props.onEvaluate({
        talentId: candidate.talentId,
        rating,
        answer,
        reasonIds,
        reasonText,
        reasonsSkipped: false,
      });
      // Mutation owners display failures. Keep this draft and position for retry.
      if (result !== null && result !== false) props.onSubmitted?.();
    } catch {
      // The mutation owner reports the error; do not advance or erase the draft.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div aria-label={c("후보 평가", "Rate candidate")} className="flex flex-wrap gap-1.5" role="group">
        {ROLE_START_GRADES.map((grade) => (
          <RoleToggleButton
            active={rating === grade}
            disabled={disabled}
            key={grade}
            onClick={() => { setRating(current => current === grade ? null : grade); setReasonIds([]); }}
          >
            <Image alt="" aria-hidden className="size-4" height={16} src={`/svgs/${grade}.svg`} width={16} />
            {gradeLabel(grade)}
          </RoleToggleButton>
        ))}
      </div>
      <div aria-label={c("평가 이유", "Reason for this rating")} className="grid gap-3">
        {chips.length ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <RoleToggleButton
                active={reasonIds.includes(chip.id)}
                disabled={disabled}
                key={chip.id}
                onClick={() => setReasonIds(current => current.includes(chip.id) ? current.filter(id => id !== chip.id) : [...current, chip.id])}
              >
                {chip.label}
              </RoleToggleButton>
            ))}
          </div>
        ) : null}
        <Textarea
          aria-label={c("평가 이유 직접 적기", "Write the reason yourself")}
          autoResize
          rows={3}
          disabled={disabled}
          onChange={(event) => setReasonText(event.target.value)}
          placeholder={c("이유를 직접 적어도 돼요", "Or write the reason yourself")}
          value={reasonText}
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {props.onBack ? (
          <MuteButton disabled={props.busy || submitting} onClick={props.onBack} size="lg" variant="transparent">
            <ArrowLeft className="size-4" />
            {c("이전", "Back")}
          </MuteButton>
        ) : <span />}
        <MuteButton disabled={disabled || !hasFeedback || props.submitDisabled} size="lg" type="submit" variant="primary">
          {c("제출하기", "Submit")}
        </MuteButton>
      </div>
    </form>
  );
}
