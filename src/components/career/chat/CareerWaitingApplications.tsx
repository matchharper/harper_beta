import { useCareerT } from "@/i18n/useCareerT";
import { useCareerOpenForms, type CareerOpenFormsSnapshot } from "@/hooks/career/useCareerOpenForms";
import { useCareerFormRevealer } from "./CareerFormReferenceProvider";

/**
 * Open application review forms: linked to a role or opportunity. Shown only while no work runs, so the chip never
 * repeats the timeline's working display (Design.md "답변 대기 폼"). 11/19~25: of 279 unanswered application forms,
 * 69 belonged to people who wrote in chat within 10 minutes without answering the form, 17 of them asking whether it
 * was done.
 */
export function waitingApplicationFormIds(snapshot: CareerOpenFormsSnapshot | undefined): number[] {
  if (!snapshot || snapshot.activities?.length || snapshot.hasActiveInputTurn) return [];
  return snapshot.forms
    .filter(form => form.kind === "form" && !form.hidden && (form.relatedRefs ?? []).some(ref => ref.type === "role" || ref.type === "opportunity"))
    .map(form => form.formId);
}

/** "답 기다리는 지원 N개" above the composer; pressing it scrolls to the first waiting form. */
/** busy: a reply is streaming in this panel, which the polled work status may not show yet. */
export function CareerWaitingApplications({ conversationId, busy = false }: { conversationId?: string | null; busy?: boolean }) {
  const t = useCareerT();
  const forms = useCareerOpenForms(conversationId);
  const { canReveal, reveal } = useCareerFormRevealer();
  const ids = waitingApplicationFormIds(forms.data);
  if (busy || !ids.length) return null;
  const label = t("career.forms.waitingApplications", "답 기다리는 지원 {count}개", { values: { count: ids.length } });
  const target = ids.find(canReveal);
  const className = "mb-2 inline-flex items-center gap-1.5 rounded-full bg-action-faded px-2 py-0.5 text-[12px] leading-5 text-action";
  return target === undefined
    ? <div role="status" className={className}>{label}</div>
    : <button type="button" className={`${className} hover:underline`} onClick={() => reveal(target)}>{label}</button>;
}
