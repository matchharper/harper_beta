const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function renderResourceInteraction(payload: unknown) {
  const interaction = record(record(payload).careerResourceInteraction);
  if (!interaction.id) return "";
  return [
    "User action context:",
    `${interaction.kind}:${interaction.id} revision ${interaction.revision}`,
    interaction.selectionRef
      ? `Exact selected snapshot: ${JSON.stringify(interaction.selectionRef)}. Read this server selection across all pages.`
      : "",
    Array.isArray(interaction.sourceRefs)
      ? `Related resources: ${JSON.stringify(interaction.sourceRefs)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
