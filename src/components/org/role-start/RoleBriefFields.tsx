import { Plus, Trash2, X } from "lucide-react";
import { type Dispatch, type SetStateAction, useState } from "react";
import {
  RoleSectionHeading,
  RoleToggleButton,
} from "@/components/org/role-overview/RoleOverviewShared";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RoleReferenceList } from "@/components/org/role-start/RoleReferenceList";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { criterionLevel, criterionLevelFields } from "@/lib/org/roleCriteria";
import { isProtectedNote, MAX_OTHER_NOTES, PROTECTED_NOTE_MESSAGE } from "@/lib/org/roleStart/brief";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";

/**
 * Editing fields shared by the Brief review in the 시작 tab and the rubric
 * editor in the candidate board's filter panel: 필수 조건 (profile facts and
 * required criteria checked on the career), 평가 기준 (중요 / 있으면 좋음,
 * remove, add) and change-by-request.
 */
export function RoleBriefFields({
  busy,
  dirty,
  draft,
  hideRequest = false,
  onRequest,
  setDraft,
}: {
  busy: boolean;
  /** The change-by-request box lives elsewhere on the screen (the Brief step's left column). */
  hideRequest?: boolean;
  dirty: boolean;
  draft: RoleStartBriefView;
  onRequest: (request: string) => void;
  setDraft: Dispatch<SetStateAction<RoleStartBriefView>>;
}) {
  const { c } = useOrgLocale();
  const [request, setRequest] = useState("");
  const updateCriterion = (index: number, patch: Partial<RoleStartBriefView["criteria"][number]>) =>
    setDraft((current) => ({
      ...current,
      criteria: current.criteria.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    }));

  const removeCriterion = (index: number) =>
    setDraft((current) => ({ ...current, criteria: current.criteria.filter((_item, position) => position !== index) }));
  // One list, shown in two places: required criteria are 필수 조건 (checked on the career), the rest only order people.
  const listed = draft.criteria.map((criterion, index) => ({ criterion, index }));
  const required = listed.filter(({ criterion }) => criterionLevel(criterion) === "required");
  const ordering = listed.filter(({ criterion }) => criterionLevel(criterion) !== "required");
  // Companies see each item numbered: chips then required criteria share one 필수 조건 sequence.
  const requiredName = (position: number) =>
    c("필수 조건 {p0}", "Required condition {p0}", { p0: String(position + 1) });
  const criterionName = (position: number) =>
    c("평가 기준 {p0}", "Evaluation criterion {p0}", { p0: String(position + 1) });

  return (
    <>
        <div className="mt-6">
          <RoleSectionHeading
            description={c(
              "여기 적힌 조건을 갖추지 않은 분은 추천하지 않아요.",
              "People without these conditions are not recommended."
            )}
            title={c("필수 조건", "Required conditions")}
          />
          {draft.hardConditions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {draft.hardConditions.map((condition, position) => (
                <div
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-bg-weak py-1 pl-2.5 pr-1 text-[13px]"
                  key={condition.id}
                >
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-soft">{requiredName(position)}</span>
                  {condition.kind === "min_years" || condition.kind === "max_years" ? (
                    <>
                      <span>{c("경력", "Experience")}</span>
                      <Input
                        aria-label={condition.label}
                        className="h-6 w-14 px-1.5 py-0 text-[13px]"
                        disabled={busy}
                        min={0}
                        onChange={(event) => {
                          const years = Number(event.target.value);
                          setDraft({
                            ...draft,
                            hardConditions: draft.hardConditions.map((item) =>
                              item.id === condition.id && (item.kind === "min_years" || item.kind === "max_years")
                                ? { ...item, years, label: `경력 ${years}년 ${item.kind === "min_years" ? "이상" : "이하"}` }
                                : item
                            ),
                          });
                        }}
                        type="number"
                        value={condition.years}
                      />
                      <span>
                        {condition.kind === "min_years" ? c("년 이상", "+ years") : c("년 이하", "years or less")}
                      </span>
                    </>
                  ) : (
                    <span>{condition.label}</span>
                  )}
                  <MuteButton
                    aria-label={c("{p0} 빼기", "Remove {p0}", { p0: condition.label })}
                    disabled={busy}
                    onClick={() =>
                      setDraft({ ...draft, hardConditions: draft.hardConditions.filter((item) => item.id !== condition.id) })
                    }
                    size="sm"
                    variant="transparent"
                  >
                    <X className="size-3.5" />
                  </MuteButton>
                </div>
              ))}
            </div>
          ) : null}
          {required.length ? (
            <div className="mt-3 grid gap-3">
              {required.map(({ criterion, index }, position) => (
                <CriterionCard
                  busy={busy}
                  criterion={criterion}
                  index={index}
                  key={criterion.id ?? `new-${index}`}
                  label={requiredName(draft.hardConditions.length + position)}
                  onRemove={() => removeCriterion(index)}
                  onUpdate={(patch) => updateCriterion(index, patch)}
                >
                  <MuteButton disabled={busy} onClick={() => updateCriterion(index, criterionLevelFields("important"))} size="sm" variant="transparent">
                    {c("평가 기준으로 옮기기", "Make it a criterion")}
                  </MuteButton>
                </CriterionCard>
              ))}
            </div>
          ) : null}
          {!draft.hardConditions.length && !required.length ? (
            <div className="mt-3 rounded-md bg-bg-basement px-4 py-3 text-[13px] leading-5 text-neutral-muted">
              {c("필수 조건이 없어요. 공개된 모든 인재 중에서 골라요.", "No required conditions. Harper considers everyone open to matches.")}
            </div>
          ) : null}
        </div>

        <div className="mt-10">
          <RoleSectionHeading
            description={c(
              "추천은 평가 기준을 근거로 해요. 더 잘 맞는 분을 먼저 보여 주고, 기준마다 얼마나 맞는지 함께 보여 드려요. '중요'는 '있으면 좋음'보다 무겁게 봐요.",
              "Recommendations are based on the evaluation criteria. Better fits come first, with how well each criterion fits. 'Important' weighs more than 'nice to have'."
            )}
            title={c("평가 기준", "Evaluation criteria")}
          />
          <div className="mt-3 grid gap-3">
            {ordering.map(({ criterion, index }, position) => (
              <CriterionCard
                busy={busy}
                criterion={criterion}
                index={index}
                key={criterion.id ?? `new-${index}`}
                label={criterionName(position)}
                onRemove={() => removeCriterion(index)}
                onUpdate={(patch) => updateCriterion(index, patch)}
              >
                {(["nice", "important"] as const).map((level) => (
                  <RoleToggleButton
                    active={criterionLevel(criterion) === level}
                    disabled={busy}
                    key={level}
                    onClick={() => updateCriterion(index, criterionLevelFields(level))}
                  >
                    {level === "important" ? c("중요", "Important") : c("있으면 좋음", "Nice to have")}
                  </RoleToggleButton>
                ))}
                <MuteButton disabled={busy} onClick={() => updateCriterion(index, criterionLevelFields("required"))} size="sm" variant="transparent">
                  {c("필수 조건으로 옮기기", "Make required")}
                </MuteButton>
              </CriterionCard>
            ))}
              <MuteButton
                className="justify-self-start"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    ...draft,
                    criteria: [...draft.criteria, { id: undefined, name: "", criteria: "", requirement: "preferred", importance: 2, changeReason: undefined, changedAt: undefined, reference: null }],
                  })
                }
                variant="transparent"
              >
                <Plus className="size-3.5" />
                {c("기준 추가하기", "Add criterion")}
              </MuteButton>
          </div>
          <RoleReferenceList references={draft.references} />
        </div>

        <div className="mt-8">
          <RoleSectionHeading
            description={c(
              "필수 조건이나 평가 기준은 아니지만 팀이 바라는 점이에요. 매칭에 참고만 하고, 이것만으로 후보를 빼지 않아요.",
              "What the team would like that is neither a required condition nor a criterion. Matching only takes it into account; it never excludes anyone."
            )}
            title={c("기타 참고 사항", "Other notes")}
          />
          <div className="mt-3 grid gap-2">
            {(draft.otherNotes ?? []).map((note, index) => (
              <div className="grid gap-1" key={index}>
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label={c("기타 참고 사항 {p0}", "Other note {p0}", { p0: String(index + 1) })}
                    className="min-w-0 flex-1"
                    disabled={busy}
                    maxLength={120}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        otherNotes: (current.otherNotes ?? []).map((item, position) => (position === index ? value : item)),
                      }));
                    }}
                    placeholder={c("예: 1월 입사 가능, 월 1회 해외 출장", "e.g. Can start in January, one trip abroad a month")}
                    value={note}
                  />
                  <MuteButton
                    aria-label={c("기타 참고 사항 {p0} 빼기", "Remove other note {p0}", { p0: String(index + 1) })}
                    disabled={busy}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        otherNotes: (current.otherNotes ?? []).filter((_item, position) => position !== index),
                      }))
                    }
                    size="sm"
                    variant="transparent"
                  >
                    <X className="size-3.5" />
                  </MuteButton>
                </div>
                {isProtectedNote(note) ? (
                  <p className="text-[12px] leading-5 text-red-700">{c(PROTECTED_NOTE_MESSAGE, "Age, gender and similar traits are not used for matching. Write it as years of experience or a job requirement.")}</p>
                ) : null}
              </div>
            ))}
            {(draft.otherNotes ?? []).length < MAX_OTHER_NOTES ? (
              <MuteButton
                className="justify-self-start"
                disabled={busy}
                onClick={() => setDraft((current) => ({ ...current, otherNotes: [...(current.otherNotes ?? []), ""] }))}
                variant="transparent"
              >
                <Plus className="size-3.5" />
                {c("참고 사항 추가하기", "Add a note")}
              </MuteButton>
            ) : null}
          </div>
        </div>

        {hideRequest ? null : (
        <form
          className="mt-10 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (request.trim()) {
              onRequest(request.trim());
              setRequest("");
            }
          }}
        >
          <RoleSectionHeading
            description={c(
              "바꾸고 싶은 점을 글로 적으면 Harper가 기준과 조건에 반영해요.",
              "Describe a change and Harper applies it to the criteria and conditions."
            )}
            title={c("글로 고치기", "Change in your own words")}
          />
          <Textarea
            aria-label={c("글로 고치기", "Change in your own words")}
            autoResize
            className="min-h-[64px]"
            disabled={busy}
            onChange={(event) => setRequest(event.target.value)}
            placeholder={c(
              "예: B2B 경험은 필수가 아니에요. 대신 데이터 파이프라인 운영 경험을 꼭 봐 주세요.",
              "e.g. B2B experience isn't required, but data pipeline operations is a must."
            )}
            rows={2}
            value={request}
          />
          <MuteButton className="justify-self-start" disabled={busy || !request.trim() || dirty} type="submit">
            {busy ? c("반영하는 중", "Applying") : c("요청 반영하기", "Apply")}
          </MuteButton>
        </form>
        )}
    </>
  );
}

type Criterion = RoleStartBriefView["criteria"][number];

/** One criterion: name, what counts as evidence, and the buttons for where it belongs. */
function CriterionCard(props: {
  busy: boolean;
  children: React.ReactNode;
  criterion: Criterion;
  index: number;
  label?: string;
  onRemove: () => void;
  onUpdate: (patch: Partial<Criterion>) => void;
}) {
  const { c } = useOrgLocale();
  const { criterion, index } = props;
  return (
    <div className="rounded-md bg-bg-basement p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-neutral-primary">
          {props.label ?? c("기준", "Criterion")}
          {criterion.reference ? <span className="font-normal text-neutral-soft"> · {criterion.reference}</span> : null}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {props.children}
          <MuteButton
            aria-label={c("{p0} 삭제", "Delete {p0}", { p0: criterion.name || props.label || c("기준", "criterion") })}
            disabled={props.busy}
            onClick={props.onRemove}
            size="sm"
            variant="transparent"
          >
            <Trash2 className="size-3.5" />
          </MuteButton>
        </div>
      </div>
      <Input
        aria-label={c("{p0} 이름", "{p0} name", { p0: criterion.name || props.label || c("기준", "Criterion") })}
        disabled={props.busy}
        onChange={(event) => props.onUpdate({ name: event.target.value })}
        value={criterion.name}
      />
      <Textarea
        aria-label={c("{p0} 상세 내용", "{p0} details", { p0: criterion.name || props.label || c("기준", "Criterion") })}
        autoResize
        className="mt-2 min-h-[72px]"
        disabled={props.busy}
        onChange={(event) => props.onUpdate({ criteria: event.target.value })}
        rows={3}
        value={criterion.criteria}
      />
    </div>
  );
}
