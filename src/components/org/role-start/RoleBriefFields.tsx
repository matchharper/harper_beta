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
import { criterionLevel, criterionLevelFields, ORG_ROLE_CRITERION_LEVELS } from "@/lib/org/roleCriteria";
import type { RoleStartBriefView } from "@/lib/org/roleStart/view";

/**
 * Editing fields shared by the Brief review in the 시작 tab and the rubric
 * editor in the candidate board: one evaluation criteria list with
 * 있으면 좋음 / 중요 / 필수, plus change-by-request.
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

  return (
    <>
        <div className="mt-6">
          <RoleSectionHeading title={c("평가 기준", "Evaluation criteria")} />
          {draft.hardConditions.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {draft.hardConditions.map((condition) => (
                <div
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-bg-weak py-1 pl-2.5 pr-1 text-[13px]"
                  key={condition.id}
                >
                  <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-soft">{c("필수", "Required")}</span>
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
          <div className="mt-3 grid gap-3">
            {draft.criteria.map((criterion, index) => (
              <CriterionCard
                busy={busy}
                criterion={criterion}
                key={criterion.id ?? `new-${index}`}
                onRemove={() => removeCriterion(index)}
                onUpdate={(patch) => updateCriterion(index, patch)}
              >
                {ORG_ROLE_CRITERION_LEVELS.map(({ level, ko, en }) => (
                  <RoleToggleButton
                    active={criterionLevel(criterion) === level}
                    disabled={busy}
                    key={level}
                    onClick={() => updateCriterion(index, criterionLevelFields(level))}
                  >
                    {c(ko, en)}
                  </RoleToggleButton>
                ))}
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
  onRemove: () => void;
  onUpdate: (patch: Partial<Criterion>) => void;
}) {
  const { c } = useOrgLocale();
  const { criterion } = props;
  return (
    <div className="rounded-md bg-bg-basement p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-neutral-primary">
          {criterion.reference ?? null}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {props.children}
          <MuteButton
            aria-label={c("{p0} 삭제", "Delete {p0}", { p0: criterion.name || c("기준", "criterion") })}
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
        aria-label={c("{p0} 이름", "{p0} name", { p0: criterion.name || c("기준", "Criterion") })}
        disabled={props.busy}
        onChange={(event) => props.onUpdate({ name: event.target.value })}
        value={criterion.name}
      />
      <Textarea
        aria-label={c("{p0} 상세 내용", "{p0} details", { p0: criterion.name || c("기준", "Criterion") })}
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
