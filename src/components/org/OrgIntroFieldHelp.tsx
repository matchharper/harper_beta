import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  findUnknownOrgIntroFields,
  ORG_INTRO_TEMPLATE_FIELDS,
  suggestOrgIntroField,
} from "@/lib/org/messageTemplates";
import { cn } from "@/lib/utils";

const FIELDS = Object.values(ORG_INTRO_TEMPLATE_FIELDS);

/** Puts `text` at the cursor of a subject or body field. */
export function insertAtCursor(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  text: string,
  setValue: (value: string) => void
) {
  if (!element) return;
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  setValue(element.value.slice(0, start) + text + element.value.slice(end));
  requestAnimationFrame(() => {
    element.focus();
    element.setSelectionRange(start + text.length, start + text.length);
  });
}

/**
 * Value chips for a team-written intro email, plus a warning for any `{...}`
 * that would reach the candidate unchanged (a typo such as {내이름}).
 */
export function OrgIntroFieldHelp({
  body,
  className,
  disabled = false,
  onFix,
  onInsert,
  subject,
}: {
  body: string;
  className?: string;
  disabled?: boolean;
  onFix: (from: string, to: string) => void;
  onInsert: (field: string) => void;
  subject: string;
}) {
  const { c } = useOrgLocale();
  const unknown = findUnknownOrgIntroFields(subject, body);
  return (
    <div className={cn("space-y-1.5 text-[12px]", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-neutral-muted">
          {c("후보자마다 바뀌는 값", "Filled in per candidate")}
        </span>
        {FIELDS.map((field) => (
          <MuteButton
            disabled={disabled}
            key={field}
            // Keep the cursor in the field being edited.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onInsert(field)}
            size="sm"
            type="button"
          >
            {field}
          </MuteButton>
        ))}
      </div>
      {unknown.length ? (
        <div className="space-y-1 text-critical" role="alert">
          {unknown.map((token) => {
            const suggestion = suggestOrgIntroField(token);
            return (
              <p key={token}>
                {c(
                  "‘{p0}’ 값은 바뀌지 않고 그대로 보내져요.",
                  "‘{p0}’ won't be filled in and will be sent as written.",
                  { p0: token }
                )}{" "}
                {suggestion ? (
                  <button
                    className="underline underline-offset-2"
                    disabled={disabled}
                    onClick={() => onFix(token, suggestion)}
                    type="button"
                  >
                    {c("바꾸기: {p0}", "Change to {p0}", { p0: suggestion })}
                  </button>
                ) : null}
              </p>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
