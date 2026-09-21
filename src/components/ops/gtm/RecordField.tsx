import { useEffect, useState } from "react";
import { gtmRequest } from "@/lib/gtm/client";
import type { GtmField } from "@/lib/gtm/types";
import type { ReferenceOption } from "@/components/ui/data-grid/DataGrid";

export type InputField = Partial<GtmField> & {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
};
export default function RecordField({
  field,
  value,
  onChange,
  disabled = false,
  readOnly = false,
}: {
  field: InputField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const [options, setOptions] = useState<ReferenceOption[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!field.reference) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      gtmRequest<{ options: ReferenceOption[] }>(
        "reference_options",
        { source: field.reference, search, selected_id: value || undefined },
        controller.signal
      )
        .then((result) => {
          setOptions(result.options);
          setError("");
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(String(cause));
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [field.reference, search, value]);
  const props = {
    "aria-label": field.label,
    disabled,
    required: field.required,
    value,
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => onChange(event.target.value),
  };
  return (
    <label>
      <span>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.reference ? (
        <>
          {!readOnly && (
            <input
              aria-label={`${field.label} 검색`}
              placeholder="기록 검색"
              disabled={disabled}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <select {...props} disabled={disabled || readOnly}>
            <option value="">선택 없음</option>
            {value && !options.some((option) => option.id === value) && (
              <option value={value}>{value}</option>
            )}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {error && <span role="alert">{error}</span>}
        </>
      ) : field.options || field.type === "boolean" ? (
        <select {...props} disabled={disabled || readOnly}>
          <option value="">—</option>
          {field.options &&
            value &&
            !field.options.some((option) => option.value === value) && (
              <option value={value}>{value}</option>
            )}
          {(
            field.options ?? [
              { value: "TRUE", label: "예" },
              { value: "FALSE", label: "아니요" },
            ]
          ).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <input {...props} type="number" step="any" readOnly={readOnly} />
      ) : field.type === "date" ? (
        <input
          {...props}
          type="datetime-local"
          step="1"
          title={Intl.DateTimeFormat().resolvedOptions().timeZone}
          value={
            value && Number.isFinite(new Date(value).getTime())
              ? new Date(
                  new Date(value).getTime() -
                    new Date(value).getTimezoneOffset() * 60000
                )
                  .toISOString()
                  .slice(0, 19)
              : ""
          }
          onChange={(event) =>
            onChange(
              event.target.value
                ? new Date(event.target.value).toISOString()
                : ""
            )
          }
          readOnly={readOnly}
        />
      ) : (
        <textarea {...props} rows={2} readOnly={readOnly} />
      )}
    </label>
  );
}
