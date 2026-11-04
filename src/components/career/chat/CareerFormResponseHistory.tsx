import { useCareerT } from "@/i18n/useCareerT";
import { findCareerFormAction, getCareerFormContent, type CareerFormResponse } from "@/lib/career/forms/schema";
import { formatCareerFormValue } from "@/lib/career/forms/format";

// The immutable response remains available to the agent. The timeline shows
// the user's choice first, with the exact submitted values available on demand.
export function CareerFormResponseHistory({ response }: { response: CareerFormResponse }) {
  const t = useCareerT();
  const form = response.formSnapshot;
  const answers = response.answers ?? [response];
  const action = answers.length === 1
    ? findCareerFormAction(form, answers[0].actionId, answers[0].itemId)
    : undefined;
  return (
    <details className="wrap-break-word">
      <summary className="cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        {form.title ?? t("career.forms.response.saved", "응답 보냄")}
        <span className="mt-1 block text-sm opacity-75">
          {action?.label ?? t("career.forms.response.saved", "응답 보냄")}
        </span>
      </summary>
      <div className="mt-3 space-y-4 whitespace-pre-wrap">
        {answers.map((answer, index) => {
          const selected = findCareerFormAction(form, answer.actionId, answer.itemId);
          return <div key={answer.itemId ?? index} className="space-y-2">
            {selected?.message ? <p>{selected.message}</p> : null}
            {answer.message ? <p>{answer.message}</p> : null}
            {answer.skipped ? <p>{t("career.forms.response.skipped", "건너뜀")}</p> : null}
            <dl className="space-y-2">
              {Object.entries(answer.values).map(([id, value]) => {
                const item = form.items.find(item => item.id === id);
                const content = item ? getCareerFormContent(item) : {};
                let display = typeof value === "boolean"
                  ? value ? t("career.forms.response.checked", "선택함") : t("career.forms.response.unchecked", "선택 안 함")
                  : formatCareerFormValue(value);
                if (item?.type === "document") {
                  const file = response.selectedFiles?.find(file => file.itemId === id && file.documentId === value);
                  display = file?.fileName ?? (content.documentId === value && typeof content.fileName === "string" ? content.fileName : t("career.forms.response.file", "첨부 파일"));
                } else if (item?.type === "select" || item?.type === "multiselect") {
                  const options = Array.isArray(content.options) ? content.options : [];
                  display = (Array.isArray(value) ? value : [value]).map(entry => {
                    const option = options.find(option => option && typeof option === "object" && option.id === entry);
                    return option && typeof option.label === "string" ? option.label : formatCareerFormValue(entry);
                  }).join(", ");
                }
                return <div key={id}>
                  <dt className="text-sm opacity-75">{item?.label ?? id}</dt>
                  <dd>{display}</dd>
                </div>;
              })}
            </dl>
          </div>;
        })}
      </div>
    </details>
  );
}
