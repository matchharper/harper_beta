import {
  findCareerFormAction,
  getCareerFormContent,
  type CareerForm,
  type CareerFormResponse,
  type CareerFormValue,
  type CareerSuggestionAnswer,
} from "./schema";

export function formatCareerFormValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (Array.isArray(value)) return value.map(formatCareerFormValue).join(", ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${formatCareerFormValue(entry)}`)
      .join("; ");
  return String(value);
}

export function formatCareerFormForModel(form: CareerForm): string {
  const lines = [
    `Form ${form.formId}, revision ${form.revision} (${form.kind})${form.hidden ? " — hidden" : ""}`,
    ...(form.title ? [form.title] : []),
  ];
  for (const item of form.items) {
    lines.push(`- ${item.id} | ${item.label} | ${item.type}`);
    if (item.description) lines.push(`  Description: ${item.description}`);
    const content = getCareerFormContent(item);
    for (const [key, value] of Object.entries(content))
      lines.push(`  ${key}: ${formatCareerFormValue(value)}`);
    for (const action of [item.positive, item.negative])
      if (action)
        lines.push(
          `  Action ${action.id}: ${action.label}; user message: ${action.message}`
        );
  }
  for (const action of [form.positive, form.negative])
    if (action)
      lines.push(
        `Action ${action.id}: ${action.label}; user message: ${action.message}`
      );
  if (form.relatedRefs?.length)
    lines.push(
      `References: ${form.relatedRefs.map((ref) => `${ref.type} ${ref.id}`).join(", ")}`
    );
  return lines.join("\n");
}

export function formatCareerFormResponseForModel(
  response: CareerFormResponse
): string {
  if (response.answers)
    return [
      `User completed form ${response.formId}, revision ${response.revision}; ${response.answers.length} item responses submitted together.`,
      ...response.answers.flatMap((answer) => {
        const item = response.formSnapshot.items.find(
          (item) => item.id === answer.itemId
        );
        const action = findCareerFormAction(
          response.formSnapshot,
          answer.actionId,
          answer.itemId
        );
        return [
          `- ${item?.label ?? answer.itemId} [${answer.itemId}]${answer.skipped ? " — skipped" : ""}${action ? `; action ${action.id} (${action.label})` : ""}`,
          ...(action ? [`  User action message: ${action.message}`] : []),
          ...(answer.message !== undefined
            ? [`  User reply: ${answer.message}`]
            : []),
          ...Object.entries(answer.values).map(
            ([id, value]) =>
              `  ${response.formSnapshot.items.find((item) => item.id === id)?.label ?? id} [${id}]: ${formatCareerFormValue(value)}`
          ),
        ];
      }),
      "The exact form shown for these responses:",
      formatCareerFormForModel(response.formSnapshot),
    ].join("\n");
  const action = findCareerFormAction(
    response.formSnapshot,
    response.actionId,
    response.itemId
  );
  return [
    `User ${response.skipped ? "skipped" : response.actionId ? "selected" : "answered"} form ${response.formId}, revision ${response.revision}${response.itemId ? `, item ${response.itemId}` : ""}${response.actionId ? `, action ${response.actionId}${action ? ` (${action.label})` : ""}` : ""}.`,
    ...(action ? [`User message: ${action.message}`] : []),
    ...(response.message !== undefined
      ? [`User reply: ${response.message}`]
      : []),
    ...Object.entries(response.values).map(
      ([id, value]) =>
        `- ${response.formSnapshot.items.find((item) => item.id === id)?.label ?? id} [${id}]: ${formatCareerFormValue(value)}`
    ),
    "The exact form shown for this response:",
    formatCareerFormForModel(response.formSnapshot),
  ].join("\n");
}

export function buildCareerFormResponseMessage(
  form: CareerForm,
  actionId: string | undefined,
  values: Record<string, CareerFormValue>,
  itemId?: string,
  reply?: { message?: string; skipped?: boolean }
): string {
  const action = findCareerFormAction(form, actionId, itemId);
  if (actionId && !action) throw new Error("Form action not found");
  return [
    action?.message,
    reply?.message,
    ...(reply?.skipped && reply.message === undefined
      ? [
          `Skipped: ${form.items.find((item) => item.id === itemId)?.label ?? itemId}`,
        ]
      : []),
    ...Object.entries(values).map(
      ([id, value]) =>
        `${form.items.find((item) => item.id === id)?.label ?? id}: ${formatCareerFormValue(value)}`
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCareerSuggestionResponseMessage(
  form: CareerForm,
  answers: CareerSuggestionAnswer[]
): string {
  return answers
    .map((answer) =>
      [
        form.items.find((item) => item.id === answer.itemId)?.label ??
          answer.itemId,
        buildCareerFormResponseMessage(
          form,
          answer.actionId,
          answer.values,
          answer.itemId,
          answer
        ),
      ].join("\n")
    )
    .join("\n\n");
}
