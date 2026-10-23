import Image from "next/image";
import { useState } from "react";
import { OrgCriteriaEvaluation } from "@/components/org/OrgCriteriaEvaluation";
import { RoleToggleButton } from "@/components/org/role-overview/RoleOverviewShared";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { criterionLevel, type OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import type { RoleStartBriefView, RoleStartCandidateView, RoleStartView } from "@/lib/org/roleStart/view";

export type RoleStartEvaluation = RoleStartView["evaluations"][string];

export type RoleStartEvaluateBody = {
  talentId: string;
  rating: OrgRoleCriterionGrade;
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
  criteria,
}: {
  candidate: RoleStartCandidateView;
  criteria: RoleStartBriefView["criteria"];
}) {
  const { c } = useOrgLocale();
  const verdict = candidate.verdict;
  const required = new Set(
    criteria.filter((criterion) => criterionLevel(criterion) === "required").map((criterion) => criterion.id ?? criterion.name)
  );
  const groups = verdict
    ? [
        { label: c("필수 조건", "Required conditions"), items: verdict.criteria.filter((item) => required.has(item.criterionId)) },
        { label: c("평가 기준", "Evaluation criteria"), items: verdict.criteria.filter((item) => !required.has(item.criterionId)) },
      ].filter((group) => group.items.length)
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

/**
 * The team's rating of one first-three person and what it was about: reason
 * chips for the picked rating, own words (always open), or skip. A rating is
 * required; reasons are optional.
 */
export function CandidateRating(props: {
  busy: boolean;
  candidate: RoleStartCandidateView;
  editable: boolean;
  evaluation?: RoleStartEvaluation;
  onEvaluate: (body: RoleStartEvaluateBody) => void;
}) {
  const { c } = useOrgLocale();
  const gradeLabel = useGradeLabel();
  const { candidate } = props;
  const allChips = candidate.verdict?.reasonChips ?? [];
  // The per-person question is no longer shown; an answer given earlier is kept.
  const answer = props.evaluation?.answer ?? "";
  const [rating, setRating] = useState<OrgRoleCriterionGrade | null>(props.evaluation?.rating ?? null);
  const [reasonIds, setReasonIds] = useState<string[]>(() =>
    allChips
      .filter((chip) => props.evaluation?.reasons?.some((reason) => reason.chipId === chip.id))
      .map((chip) => chip.id)
  );
  const [reasonText, setReasonText] = useState(props.evaluation?.reasonText ?? "");
  const [reasonsSkipped, setReasonsSkipped] = useState(props.evaluation?.reasonsSkipped ?? false);
  const disabled = !props.editable || props.busy;
  // At most three chips for the picked rating; none before a rating is picked.
  const chips = rating ? allChips.filter((chip) => chip.appliesTo.includes(rating)).slice(0, REASON_CHIP_MAX) : [];
  const submit = (next: {
    rating?: OrgRoleCriterionGrade | null;
    reasonIds?: string[];
    reasonText?: string;
    reasonsSkipped?: boolean;
  }) => {
    const nextRating = next.rating ?? rating;
    if (!nextRating) return;
    props.onEvaluate({
      talentId: candidate.talentId,
      rating: nextRating,
      answer,
      reasonIds: next.reasonIds ?? reasonIds,
      reasonText: next.reasonText ?? reasonText,
      reasonsSkipped: next.reasonsSkipped ?? reasonsSkipped,
    });
  };

  return (
    <div className="grid gap-2">
      <div aria-label={c("후보 평가", "Rate candidate")} className="flex flex-wrap gap-1.5" role="group">
        {ROLE_START_GRADES.map((grade) => (
          <RoleToggleButton
            active={rating === grade}
            disabled={disabled}
            key={grade}
            onClick={() => {
              // Chips belong to one rating; switching ratings starts them over. Typed words stay.
              setRating(grade);
              setReasonIds([]);
              setReasonsSkipped(false);
              submit({ rating: grade, reasonIds: [], reasonsSkipped: false });
            }}
          >
            <Image alt="" aria-hidden className="size-4" height={16} src={`/svgs/${grade}.svg`} width={16} />
            {gradeLabel(grade)}
          </RoleToggleButton>
        ))}
      </div>

      <div aria-label={c("평가 이유", "Reason for this rating")} className="grid gap-2 rounded-md bg-bg-basement p-3">
        {rating ? (
          <span className="text-[12px] font-medium">
            {rating === "bad"
              ? c("어떤 점이 맞지 않나요? 여러 개 골라도 돼요.", "What doesn't fit? Pick any that apply.")
              : rating === "uncertain"
                ? c("어떤 정보가 부족한가요? 여러 개 골라도 돼요.", "What information is missing? Pick any that apply.")
                : c("어떤 점이 잘 맞나요? 여러 개 골라도 돼요.", "What fits well? Pick any that apply.")}
          </span>
        ) : null}
        {chips.length ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const selected = reasonIds.includes(chip.id);
              return (
                <RoleToggleButton
                  active={selected}
                  disabled={disabled}
                  key={chip.id}
                  onClick={() => {
                    const next = selected ? reasonIds.filter((id) => id !== chip.id) : [...reasonIds, chip.id];
                    setReasonIds(next);
                    setReasonsSkipped(false);
                    submit({ reasonIds: next, reasonsSkipped: false });
                  }}
                >
                  {chip.label}
                </RoleToggleButton>
              );
            })}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <Input
            aria-label={c("평가 이유 직접 적기", "Write the reason yourself")}
            className="min-w-0 flex-1"
            disabled={!props.editable}
            onBlur={() => reasonText !== (props.evaluation?.reasonText ?? "") && submit({ reasonText })}
            onChange={(event) => setReasonText(event.target.value)}
            placeholder={c("이유를 직접 적어도 돼요", "Or write the reason yourself")}
            value={reasonText}
          />
          {rating ? (
            <MuteButton
              aria-pressed={reasonsSkipped}
              disabled={disabled}
              onClick={() => {
                setReasonIds([]);
                setReasonText("");
                setReasonsSkipped(true);
                submit({ reasonIds: [], reasonText: "", reasonsSkipped: true });
              }}
              variant="transparent"
            >
              {c("건너뛰기", "Skip")}
            </MuteButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
