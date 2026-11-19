import { useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { getCareerSuggestionAnswers, type CareerForm, type CareerFormItem, type CareerFormResponse } from "@/lib/career/forms/schema";

type ApplyRow = (itemId: string, actionId: string, requestId: string) => Promise<void>;

function ChecklistRow({ item, checked, disabled, apply }: {
  item: CareerFormItem;
  checked: boolean;
  disabled: boolean;
  apply: ApplyRow;
}) {
  const t = useCareerT();
  const id = useId();
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const action = item.positive;
  const submit = async () => {
    if (!action || disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      requestId.current ??= crypto.randomUUID();
      await apply(item.id, action.id, requestId.current);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return <li className="col-span-full grid min-h-14 grid-cols-subgrid items-start py-2.5">
    <Checkbox checked={checked} disabled aria-labelledby={id} size="medium"
      className="mt-[7px] shadow-none disabled:cursor-default disabled:border-button-border disabled:bg-control disabled:opacity-100 checked:disabled:border-action checked:disabled:bg-action" />
    <div className="min-w-0 py-1.5 break-keep [overflow-wrap:anywhere]">
      <span id={id} className={`block text-sm leading-5 ${checked ? "text-neutral-muted line-through decoration-neutral-soft" : "font-medium text-neutral-primary"}`}>{item.label}</span>
      {item.description && <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5 text-neutral-muted">{item.description}</p>}
    </div>
    {checked ? (
      <span role="status" className="justify-self-end py-1.5 text-xs leading-5 text-neutral-muted">
        {t("career.resources.work_completed", "완료")}
      </span>
    ) : (
      <MuteButton size="sm" className="min-h-8 max-w-24 justify-self-end whitespace-normal break-keep rounded-lg border-transparent bg-bg-weak bg-none px-3 shadow-none sm:max-w-32"
        disabled={disabled || pending} aria-busy={pending}
        aria-labelledby={`${id} ${id}-action`} onClick={() => void submit()}>
        {pending && <LoaderCircle aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />}
        <span id={`${id}-action`}>{action?.label}</span>
      </MuteButton>
    )}
    {failed && !disabled && <p role="alert" className="col-span-2 col-start-2 mt-1 text-sm text-critical">
      {t("career.forms.saveError", "응답을 저장하지 못했어요. 다시 시도해 주세요.")}
    </p>}
  </li>;
}

export function CareerChecklistRows({ form, responses, unavailable, apply }: {
  form: CareerForm;
  responses: CareerFormResponse[];
  unavailable: boolean;
  apply: ApplyRow;
}) {
  const answers = getCareerSuggestionAnswers(form, responses);
  return <ul className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 divide-y divide-stroke-subtle">
    {form.items.map(item => {
      const answer = answers[item.id];
      return <ChecklistRow key={item.id} item={item} checked={Boolean(answer && !answer.skipped && answer.actionId === item.positive?.id)}
        disabled={unavailable || form.state !== "open" || Boolean(answer)} apply={apply} />;
    })}
  </ul>;
}
